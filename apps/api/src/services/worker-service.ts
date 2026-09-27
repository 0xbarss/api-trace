import type { Redis } from "ioredis";
import { eq, sql } from "drizzle-orm";
import type { Database, RedisQueue, TestResultDetail } from "@apitrace/core";
import { testRuns, testResults } from "@apitrace/core";
import type { TestJobPayload } from "@apitrace/planner";
import { executeTestJob, HttpProbeClient } from "@apitrace/test-engine";
import { publishRunEvent } from "../routes/websocket.js";

export class TestExecutionWorker {
  private readonly probeClient: HttpProbeClient;
  private isRunning = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly db: Database,
    private readonly queue: RedisQueue<TestJobPayload>,
    private readonly redis: Redis
  ) {
    this.probeClient = new HttpProbeClient({
      timeoutMs: 10000,
      maxRetries: 1,
    });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    await this.close();
  }

  async close(): Promise<void> {
    await this.probeClient.close();
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const processed = await this.processNextJob(1);
        if (!processed) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  async processNextJob(timeoutSeconds = 0): Promise<boolean> {
    const item =
      timeoutSeconds > 0
        ? await this.queue.pop(timeoutSeconds)
        : await this.queue.popNow();
    if (!item) return false;

    const job = item.data;

    try {
      // Mark run as executing if it is still queued
      await this.db
        .update(testRuns)
        .set({ status: "running" })
        .where(eq(testRuns.id, job.runId));

      // Execute probe check via test engine
      const execResult = await executeTestJob(job, undefined, this.probeClient);

      // Record result in database
      const [savedResult] = await this.db
        .insert(testResults)
        .values({
          runId: job.runId,
          endpointId: job.endpointId,
          category: job.category,
          testName: job.testName,
          status: execResult.status,
          severity: execResult.severity,
          latencyMs: execResult.latencyMs,
          detail: execResult.detail,
        })
        .returning();

      // Atomically update test run counters
      const isPass = execResult.status === "pass";
      const isWarn = execResult.status === "warn";
      const isFail = execResult.status === "fail" || execResult.status === "error";

      await this.db
        .update(testRuns)
        .set({
          completedTests: sql`${testRuns.completedTests} + 1`,
          passedTests: isPass ? sql`${testRuns.passedTests} + 1` : testRuns.passedTests,
          warningTests: isWarn ? sql`${testRuns.warningTests} + 1` : testRuns.warningTests,
          failedTests: isFail ? sql`${testRuns.failedTests} + 1` : testRuns.failedTests,
        })
        .where(eq(testRuns.id, job.runId));

      // Fetch current run state to check if finished
      const [currentRun] = await this.db
        .select()
        .from(testRuns)
        .where(eq(testRuns.id, job.runId));

      const isCompleted = currentRun && currentRun.completedTests >= currentRun.totalTests;

      if (isCompleted) {
        await this.db
          .update(testRuns)
          .set({
            status: "completed",
            finishedAt: new Date(),
          })
          .where(eq(testRuns.id, job.runId));
      }

      // Acknowledge task from queue
      await this.queue.ack(item.raw);

      // Publish real-time test event to Redis PubSub for WebSocket clients
      await publishRunEvent(this.redis, job.runId, {
        type: "TEST_COMPLETED",
        runId: job.runId,
        endpointId: job.endpointId,
        totalTests: currentRun?.totalTests,
        completedTests: currentRun?.completedTests,
        result: {
          id: savedResult.id,
          runId: savedResult.runId,
          endpointId: savedResult.endpointId,
          category: savedResult.category as "security" | "performance" | "contract",
          testName: savedResult.testName,
          status: savedResult.status as "pass" | "warn" | "fail",
          severity: savedResult.severity as "critical" | "high" | "medium" | "low" | "info",
          latencyMs: savedResult.latencyMs,
          detail: savedResult.detail as TestResultDetail,
          createdAt: savedResult.createdAt.toISOString(),
        },
      });

      if (isCompleted) {
        await publishRunEvent(this.redis, job.runId, {
          type: "RUN_COMPLETED",
          runId: job.runId,
          status: "completed",
          totalTests: currentRun.totalTests,
          completedTests: currentRun.completedTests,
        });
      }

      return true;
    } catch (err) {
      await this.queue.moveToDlq(item.raw, err instanceof Error ? err.message : String(err));
      return true;
    }
  }

  async drainQueue(maxJobs = 100): Promise<number> {
    let processed = 0;
    while (processed < maxJobs) {
      const hadJob = await this.processNextJob();
      if (!hadJob) break;
      processed++;
    }
    return processed;
  }
}
