import { eq, desc } from "drizzle-orm";
import { generateTestPlan, type TestJobPayload } from "@apitrace/planner";
import {
  targets,
  endpoints,
  testRuns,
  testResults,
  type Database,
  type RedisQueue,
} from "@apitrace/core";
import { HttpError } from "../plugins/error-handler.js";
import type {
  CreateRunBody,
  CreateRunResponse,
  RunSummaryResponse,
  RunResultResponse,
} from "../types.js";

export class RunService {
  constructor(
    private readonly db: Database,
    private readonly queue: RedisQueue<TestJobPayload>
  ) {}

  async createRun(targetId: string, body?: CreateRunBody): Promise<CreateRunResponse> {
    const [target] = await this.db.select().from(targets).where(eq(targets.id, targetId));
    if (!target) {
      throw new HttpError(404, `Target with id '${targetId}' not found`);
    }

    const targetEndpoints = await this.db
      .select()
      .from(endpoints)
      .where(eq(endpoints.targetId, targetId));

    const [run] = await this.db
      .insert(testRuns)
      .values({
        targetId: target.id,
        status: "queued",
        startedAt: new Date(),
        totalTests: 0,
      })
      .returning();

    const jobs = generateTestPlan({
      runId: run.id,
      targetId: target.id,
      baseUrl: target.baseUrl,
      endpoints: targetEndpoints,
      options: body,
    });

    if (jobs.length > 0) {
      await this.queue.pushBatch(jobs);
    }

    await this.db
      .update(testRuns)
      .set({ totalTests: jobs.length })
      .where(eq(testRuns.id, run.id));

    return {
      runId: run.id,
      totalTests: jobs.length,
      status: "queued",
    };
  }

  async getRunById(id: string): Promise<RunSummaryResponse> {
    const [run] = await this.db.select().from(testRuns).where(eq(testRuns.id, id));
    if (!run) {
      throw new HttpError(404, `Test run with id '${id}' not found`);
    }

    return {
      id: run.id,
      targetId: run.targetId,
      status: run.status,
      totalTests: run.totalTests,
      completedTests: run.completedTests,
      passedTests: run.passedTests,
      failedTests: run.failedTests,
      warningTests: run.warningTests,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  async getRunResults(runId: string): Promise<RunResultResponse[]> {
    const [run] = await this.db.select().from(testRuns).where(eq(testRuns.id, runId));
    if (!run) {
      throw new HttpError(404, `Test run with id '${runId}' not found`);
    }

    const results = await this.db
      .select()
      .from(testResults)
      .where(eq(testResults.runId, runId))
      .orderBy(testResults.createdAt);

    return results.map((r) => ({
      id: r.id,
      runId: r.runId,
      endpointId: r.endpointId,
      category: r.category,
      testName: r.testName,
      status: r.status,
      severity: r.severity,
      latencyMs: r.latencyMs,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listRuns(targetId?: string): Promise<RunSummaryResponse[]> {
    const baseQuery = this.db.select().from(testRuns);
    const rows = targetId
      ? await baseQuery
          .where(eq(testRuns.targetId, targetId))
          .orderBy(desc(testRuns.createdAt))
          .limit(50)
      : await baseQuery.orderBy(desc(testRuns.createdAt)).limit(50);

    return rows.map((run) => ({
      id: run.id,
      targetId: run.targetId,
      status: run.status,
      totalTests: run.totalTests,
      completedTests: run.completedTests,
      passedTests: run.passedTests,
      failedTests: run.failedTests,
      warningTests: run.warningTests,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      createdAt: run.createdAt.toISOString(),
    }));
  }
}
