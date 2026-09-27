import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import {
  pool,
  db,
  RedisQueue,
  createRedisClient,
  targets,
  endpoints,
  testRuns,
  testResults,
} from "@apitrace/core";
import type { TestJobPayload } from "@apitrace/planner";
import { TestExecutionWorker } from "../services/worker-service.js";

describe("TestExecutionWorker Integration Tests", () => {
  let mockServer: FastifyInstance;
  let mockServerPort: number;
  let testQueue: RedisQueue<TestJobPayload>;
  let redisSubscriber: Redis;
  let redisClient: Redis;
  let worker: TestExecutionWorker;

  let targetId: string;
  let endpointId: string;

  beforeAll(async () => {
    // 1. Setup mock target HTTP server to test real HTTP probe execution
    mockServer = fastify({ logger: false });
    mockServer.get("/users", async (_req, reply) => {
      return reply.header("content-type", "application/json").send([
        { id: "1", name: "Alice" },
      ]);
    });
    mockServer.get("/users/admin", async (_req, reply) => {
      return reply.status(403).send({ error: "Forbidden" });
    });

    await mockServer.listen({ port: 0, host: "127.0.0.1" });
    const address = mockServer.server.address();
    mockServerPort = typeof address === "object" && address ? address.port : 0;

    // 2. Setup isolated Redis queue and clients
    testQueue = new RedisQueue<TestJobPayload>(undefined, {
      queueKey: `apitrace:test:worker:jobs:${randomUUID()}`,
      processingKey: `apitrace:test:worker:proc:${randomUUID()}`,
      deadLetterKey: `apitrace:test:worker:dlq:${randomUUID()}`,
    });

    redisClient = testQueue.getClient();
    redisSubscriber = createRedisClient();

    // 3. Setup worker instance
    worker = new TestExecutionWorker(db, testQueue, redisClient);

    // 4. Seed database target and endpoint
    targetId = randomUUID();
    endpointId = randomUUID();

    await db.insert(targets).values({
      id: targetId,
      name: "Worker Test Target",
      baseUrl: `http://127.0.0.1:${mockServerPort}`,
      specSource: "openapi: 3.0.0\ninfo:\n  title: Mock\n  version: 1.0.0\npaths: {}\n",
    });

    await db.insert(endpoints).values({
      id: endpointId,
      targetId,
      path: "/users",
      method: "GET",
      operationId: "listUsers",
      riskScore: 2,
    });
  });

  afterAll(async () => {
    await worker.stop();
    await testQueue.clear();
    await testQueue.close();
    await redisSubscriber.quit();

    // Clean up database entities
    if (targetId) {
      await db.delete(targets).where(eq(targets.id, targetId));
    }

    await mockServer.close();
    await pool.end();
  });

  it("should return false when queue is empty", async () => {
    const processed = await worker.processNextJob(0);
    expect(processed).toBe(false);
  });

  it("should execute job from queue, persist results, and publish pubsub events", async () => {
    const runId = randomUUID();

    // Create test run with 1 total test
    await db.insert(testRuns).values({
      id: runId,
      targetId,
      status: "queued",
      totalTests: 1,
      completedTests: 0,
      passedTests: 0,
      failedTests: 0,
      warningTests: 0,
    });

    // Subscribe to run events
    const receivedEvents: Array<{ type: string; runId: string }> = [];
    const channel = `apitrace:events:${runId}`;
    await redisSubscriber.subscribe(channel);
    redisSubscriber.on("message", (_ch, msg) => {
      try {
        receivedEvents.push(JSON.parse(msg));
      } catch {
        // ignore parse error
      }
    });

    // Push test job
    const jobPayload: TestJobPayload = {
      runId,
      targetId,
      endpointId,
      baseUrl: `http://127.0.0.1:${mockServerPort}`,
      path: "/users",
      method: "GET",
      authType: "none",
      parameters: [],
      category: "security",
      testName: "unauthenticated_access",
    };

    await testQueue.push(jobPayload);

    // Process single job
    const processed = await worker.processNextJob(1);
    expect(processed).toBe(true);

    // Wait briefly for pubsub propagation
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify database testRun state
    const [updatedRun] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, runId));

    expect(updatedRun).toBeDefined();
    expect(updatedRun.status).toBe("completed");
    expect(updatedRun.completedTests).toBe(1);
    expect(updatedRun.finishedAt).not.toBeNull();

    // Verify persisted testResult
    const results = await db
      .select()
      .from(testResults)
      .where(eq(testResults.runId, runId));

    expect(results.length).toBe(1);
    expect(results[0].category).toBe("security");
    expect(results[0].testName).toBe("unauthenticated_access");
    expect(["pass", "warn", "fail", "error"]).toContain(results[0].status);
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0);

    // Verify published WebSocket events
    expect(receivedEvents.length).toBeGreaterThanOrEqual(2);
    expect(receivedEvents.some((e) => e.type === "TEST_COMPLETED")).toBe(true);
    expect(receivedEvents.some((e) => e.type === "RUN_COMPLETED")).toBe(true);

    await redisSubscriber.unsubscribe(channel);
  });

  it("should drain multiple jobs in queue until completion", async () => {
    const runId = randomUUID();

    await db.insert(testRuns).values({
      id: runId,
      targetId,
      status: "queued",
      totalTests: 2,
      completedTests: 0,
      passedTests: 0,
      failedTests: 0,
      warningTests: 0,
    });

    const job1: TestJobPayload = {
      runId,
      targetId,
      endpointId,
      baseUrl: `http://127.0.0.1:${mockServerPort}`,
      path: "/users",
      method: "GET",
      authType: "none",
      parameters: [],
      category: "performance",
      testName: "baseline_latency",
    };

    const job2: TestJobPayload = {
      runId,
      targetId,
      endpointId,
      baseUrl: `http://127.0.0.1:${mockServerPort}`,
      path: "/users",
      method: "GET",
      authType: "none",
      parameters: [],
      category: "contract",
      testName: "schema_conformance",
    };

    await testQueue.pushBatch([job1, job2]);

    const drainedCount = await worker.drainQueue(5);
    expect(drainedCount).toBe(2);

    const [finalRun] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, runId));

    expect(finalRun.status).toBe("completed");
    expect(finalRun.completedTests).toBe(2);

    const results = await db
      .select()
      .from(testResults)
      .where(eq(testResults.runId, runId));

    expect(results.length).toBe(2);
  });
});
