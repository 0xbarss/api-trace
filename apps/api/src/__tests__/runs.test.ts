import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  pool,
  db,
  RedisQueue,
  testResults,
} from "@apitrace/core";
import type { TestJobPayload } from "@apitrace/planner";
import { buildServer } from "../server.js";

const SAMPLE_SPEC = `
openapi: 3.0.0
info:
  title: Runs API Target
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: OK
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [username]
              properties:
                username:
                  type: string
      responses:
        '201':
          description: Created
  /users/{id}:
    get:
      summary: Get user
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
`;

describe("Test Run Trigger & Query Routes (/api/targets/:id/runs & /api/runs)", () => {
  let app: FastifyInstance;
  let testQueue: RedisQueue<TestJobPayload>;
  const createdTargetIds: string[] = [];

  beforeAll(async () => {
    testQueue = new RedisQueue<TestJobPayload>(undefined, {
      queueKey: `apitrace:test:runs:jobs:${randomUUID()}`,
      processingKey: `apitrace:test:runs:proc:${randomUUID()}`,
      deadLetterKey: `apitrace:test:runs:dlq:${randomUUID()}`,
    });

    app = await buildServer({
      logger: false,
      queue: testQueue,
    });
  });

  afterAll(async () => {
    for (const targetId of createdTargetIds) {
      await app.inject({
        method: "DELETE",
        url: `/api/targets/${targetId}`,
      });
    }

    await testQueue.clear();
    await testQueue.close();
    await app.close();
    await pool.end();
  });

  it("should reject trigger when target id is not a valid uuid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/targets/not-a-uuid/runs",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe("Bad Request");
  });

  it("should return 404 when triggering run for non-existent target", async () => {
    const nonExistentId = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: `/api/targets/${nonExistentId}/runs`,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.statusCode).toBe(404);
    expect(body.message).toContain("not found");
  });

  it("should trigger test run, enqueue jobs in Redis, and return 201 queued status", async () => {
    const createTargetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Run Test Target",
        baseUrl: "https://api.example.com/v1",
        specSource: SAMPLE_SPEC,
      },
    });

    expect(createTargetRes.statusCode).toBe(201);
    const { targetId, discoveredEndpointsCount } = createTargetRes.json();
    expect(discoveredEndpointsCount).toBe(3);
    createdTargetIds.push(targetId);

    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetId}/runs`,
      payload: {},
    });

    expect(triggerRes.statusCode).toBe(201);
    const runData = triggerRes.json();
    expect(runData.runId).toBeDefined();
    expect(runData.status).toBe("queued");
    expect(runData.totalTests).toBeGreaterThan(0);

    const queueLengths = await testQueue.getQueueLengths();
    expect(queueLengths.waiting).toBe(runData.totalTests);

    const popped = await testQueue.popNow();
    expect(popped).not.toBeNull();
    expect(popped!.data.runId).toBe(runData.runId);
    expect(popped!.data.targetId).toBe(targetId);
    expect(popped!.data.baseUrl).toBe("https://api.example.com/v1");
    expect(["security", "performance", "contract"]).toContain(popped!.data.category);
  });

  it("should filter generated jobs when categories or options are specified", async () => {
    const createTargetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Category Filter Target",
        baseUrl: "https://filter.example.com",
        specSource: SAMPLE_SPEC,
      },
    });

    expect(createTargetRes.statusCode).toBe(201);
    const { targetId } = createTargetRes.json();
    createdTargetIds.push(targetId);

    await testQueue.clear();

    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetId}/runs`,
      payload: {
        categories: ["performance"],
      },
    });

    expect(triggerRes.statusCode).toBe(201);
    const runData = triggerRes.json();
    expect(runData.runId).toBeDefined();
    expect(runData.totalTests).toBeGreaterThan(0);

    const lengths = await testQueue.getQueueLengths();
    expect(lengths.waiting).toBe(runData.totalTests);

    const popped = await testQueue.popNow();
    expect(popped).not.toBeNull();
    expect(popped!.data.category).toBe("performance");
  });

  it("should return 400 when GET /api/runs/:id has invalid uuid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runs/not-valid-uuid",
    });

    expect(response.statusCode).toBe(400);
  });

  it("should return 404 when GET /api/runs/:id does not exist", async () => {
    const nonExistentId = randomUUID();
    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${nonExistentId}`,
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.message).toContain("not found");
  });

  it("should retrieve run summary via GET /api/runs/:id", async () => {
    const createTargetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Run Status Target",
        baseUrl: "https://status.example.com",
        specSource: SAMPLE_SPEC,
      },
    });

    const { targetId } = createTargetRes.json();
    createdTargetIds.push(targetId);

    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetId}/runs`,
      payload: {},
    });

    const { runId, totalTests } = triggerRes.json();

    const getRunRes = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}`,
    });

    expect(getRunRes.statusCode).toBe(200);
    const runSummary = getRunRes.json();
    expect(runSummary.id).toBe(runId);
    expect(runSummary.targetId).toBe(targetId);
    expect(runSummary.status).toBe("queued");
    expect(runSummary.totalTests).toBe(totalTests);
    expect(runSummary.completedTests).toBe(0);
    expect(runSummary.passedTests).toBe(0);
    expect(runSummary.failedTests).toBe(0);
    expect(runSummary.warningTests).toBe(0);
    expect(runSummary.startedAt).toBeDefined();
    expect(runSummary.createdAt).toBeDefined();
  });

  it("should return empty array for GET /api/runs/:id/results when no results exist", async () => {
    const createTargetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Empty Results Target",
        baseUrl: "https://empty.example.com",
        specSource: SAMPLE_SPEC,
      },
    });

    const { targetId } = createTargetRes.json();
    createdTargetIds.push(targetId);

    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetId}/runs`,
      payload: {},
    });

    const { runId } = triggerRes.json();

    const resultsRes = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/results`,
    });

    expect(resultsRes.statusCode).toBe(200);
    expect(resultsRes.json()).toEqual([]);
  });

  it("should return findings via GET /api/runs/:id/results when results are recorded", async () => {
    const createTargetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "Recorded Results Target",
        baseUrl: "https://results.example.com",
        specSource: SAMPLE_SPEC,
      },
    });

    const { targetId } = createTargetRes.json();
    createdTargetIds.push(targetId);

    const targetDetailsRes = await app.inject({
      method: "GET",
      url: `/api/targets/${targetId}`,
    });
    const targetDetails = targetDetailsRes.json();
    const endpointId = targetDetails.endpoints[0].id;

    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetId}/runs`,
      payload: {},
    });

    const { runId } = triggerRes.json();

    await db.insert(testResults).values({
      runId,
      endpointId,
      category: "security",
      testName: "auth_missing_token",
      status: "fail",
      severity: "high",
      latencyMs: 38,
      detail: {
        evidence: "Endpoint accessible without authentication header",
        remediation: "Enforce JWT authentication middleware",
      },
    });

    const resultsRes = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/results`,
    });

    expect(resultsRes.statusCode).toBe(200);
    const results = resultsRes.json();
    expect(results).toHaveLength(1);
    expect(results[0].runId).toBe(runId);
    expect(results[0].endpointId).toBe(endpointId);
    expect(results[0].category).toBe("security");
    expect(results[0].testName).toBe("auth_missing_token");
    expect(results[0].status).toBe("fail");
    expect(results[0].severity).toBe("high");
    expect(results[0].latencyMs).toBe(38);
    expect(results[0].detail.evidence).toBe("Endpoint accessible without authentication header");
  });
});
