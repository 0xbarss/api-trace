import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import {
  pool,
  createRedisClient,
  RedisQueue,
} from "@apitrace/core";
import type { TestJobPayload } from "@apitrace/planner";
import { buildServer } from "../server.js";
import { publishRunEvent } from "../routes/websocket.js";

const SAMPLE_SPEC = `
openapi: 3.0.0
info:
  title: WebSocket Test API
  version: 1.0.0
paths:
  /status:
    get:
      summary: Get status
      responses:
        '200':
          description: OK
`;

interface WSClient {
  ws: WebSocket;
  messages: unknown[];
  waitForMessage: (
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;
  waitForClose: (timeoutMs?: number) => Promise<{ code: number; reason: string }>;
  close: () => Promise<void>;
}

function createTestWebSocketClient(url: string): Promise<WSClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: unknown[] = [];
    const listeners: Array<(msg: Record<string, unknown>) => void> = [];
    let closeResolve: ((val: { code: number; reason: string }) => void) | null = null;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
        messages.push(parsed);
        for (const listener of listeners) {
          listener(parsed);
        }
      } catch {
        messages.push(event.data);
      }
    };

    ws.onclose = (event) => {
      if (closeResolve) {
        closeResolve({ code: event.code, reason: event.reason });
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage: (predicate, timeoutMs = 4000) => {
          for (const msg of messages) {
            if (typeof msg === "object" && msg !== null && predicate(msg as Record<string, unknown>)) {
              return Promise.resolve(msg as Record<string, unknown>);
            }
          }

          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error(`Timeout waiting for WebSocket message. Received: ${JSON.stringify(messages)}`));
            }, timeoutMs);

            const handler = (msg: Record<string, unknown>) => {
              if (predicate(msg)) {
                clearTimeout(timer);
                const idx = listeners.indexOf(handler);
                if (idx !== -1) listeners.splice(idx, 1);
                res(msg);
              }
            };

            listeners.push(handler);
          });
        },
        waitForClose: (timeoutMs = 4000) => {
          if (ws.readyState === WebSocket.CLOSED) {
            return Promise.resolve({ code: 1000, reason: "" });
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error("Timeout waiting for WebSocket close"));
            }, timeoutMs);

            closeResolve = (val) => {
              clearTimeout(timer);
              res(val);
            };
          });
        },
        close: async () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            await new Promise((r) => setTimeout(r, 50));
          }
        },
      });
    };
  });
}

describe("WebSocket Server & PubSub Live Progress Gateway (/ws/runs/:id & /api/runs/:id/stream)", () => {
  let app: FastifyInstance;
  let serverPort: number;
  let testQueue: RedisQueue<TestJobPayload>;
  let publisher: Redis;
  const createdTargetIds: string[] = [];
  let testRunId: string;

  beforeAll(async () => {
    testQueue = new RedisQueue<TestJobPayload>(undefined, {
      queueKey: `apitrace:test:ws:jobs:${randomUUID()}`,
      processingKey: `apitrace:test:ws:proc:${randomUUID()}`,
      deadLetterKey: `apitrace:test:ws:dlq:${randomUUID()}`,
    });

    publisher = createRedisClient();

    app = await buildServer({
      logger: false,
      queue: testQueue,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (typeof address === "object" && address !== null) {
      serverPort = address.port;
    }

    // Ingest a test target and create a run
    const targetRes = await app.inject({
      method: "POST",
      url: "/api/targets",
      payload: {
        name: "WS Test Target",
        baseUrl: "https://example.com",
        specSource: SAMPLE_SPEC,
      },
    });
    const targetBody = targetRes.json();
    createdTargetIds.push(targetBody.targetId);

    const runRes = await app.inject({
      method: "POST",
      url: `/api/targets/${targetBody.targetId}/runs`,
      payload: {},
    });
    const runBody = runRes.json();
    testRunId = runBody.runId;
  });

  afterAll(async () => {
    for (const targetId of createdTargetIds) {
      await app.inject({
        method: "DELETE",
        url: `/api/targets/${targetId}`,
      });
    }

    await publisher.quit();
    await testQueue.clear();
    await testQueue.close();
    await app.close();
    await pool.end();
  });

  it("should send error and close socket when connecting to a non-existent run ID via /ws/runs/:id", async () => {
    const nonExistentId = randomUUID();
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${nonExistentId}`);

    const errorMsg = await client.waitForMessage((m) => m.type === "ERROR");
    expect(errorMsg.type).toBe("ERROR");
    expect(errorMsg.error).toBe("Not Found");
    expect(errorMsg.message).toContain(nonExistentId);

    const closeInfo = await client.waitForClose();
    expect(closeInfo.code).toBe(1008);
  });

  it("should send error and close socket when connecting to a non-existent run ID via /api/runs/:id/stream", async () => {
    const nonExistentId = randomUUID();
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/api/runs/${nonExistentId}/stream`);

    const errorMsg = await client.waitForMessage((m) => m.type === "ERROR");
    expect(errorMsg.type).toBe("ERROR");
    expect(errorMsg.error).toBe("Not Found");

    const closeInfo = await client.waitForClose();
    expect(closeInfo.code).toBe(1008);
  });

  it("should connect successfully to /ws/runs/:id and receive CONNECTED event", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);

    const connectedMsg = await client.waitForMessage((m) => m.type === "CONNECTED");
    expect(connectedMsg.type).toBe("CONNECTED");
    expect(connectedMsg.runId).toBe(testRunId);
    expect(connectedMsg.status).toBe("queued");
    expect(connectedMsg.totalTests).toBeDefined();

    await client.close();
  });

  it("should connect successfully to /api/runs/:id/stream and receive CONNECTED event", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/api/runs/${testRunId}/stream`);

    const connectedMsg = await client.waitForMessage((m) => m.type === "CONNECTED");
    expect(connectedMsg.type).toBe("CONNECTED");
    expect(connectedMsg.runId).toBe(testRunId);

    await client.close();
  });

  it("should forward published Redis events to connected WebSocket clients in real-time", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);

    await client.waitForMessage((m) => m.type === "CONNECTED");

    // Give Redis subscriber a brief moment to finish subscribing
    await new Promise((r) => setTimeout(r, 100));

    // Publish a TEST_COMPLETED event
    const published = await publishRunEvent(publisher, testRunId, {
      type: "TEST_COMPLETED",
      endpointId: "ep-123",
      result: {
        testName: "auth-check",
        status: "pass",
        severity: "critical",
        latencyMs: 42,
      },
    });
    expect(published).toBeGreaterThanOrEqual(1);

    const receivedEvent = await client.waitForMessage((m) => m.type === "TEST_COMPLETED");
    expect(receivedEvent.type).toBe("TEST_COMPLETED");
    expect(receivedEvent.runId).toBe(testRunId);
    expect(receivedEvent.endpointId).toBe("ep-123");
    expect((receivedEvent.result as Record<string, unknown>).testName).toBe("auth-check");
    expect((receivedEvent.result as Record<string, unknown>).latencyMs).toBe(42);

    await client.close();
  });

  it("should stream sequential progress events (RUN_STARTED, PROGRESS, RUN_COMPLETED)", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);

    await client.waitForMessage((m) => m.type === "CONNECTED");
    await new Promise((r) => setTimeout(r, 100));

    await publishRunEvent(publisher, testRunId, {
      type: "RUN_STARTED",
      status: "running",
    });

    await publishRunEvent(publisher, testRunId, {
      type: "RUN_PROGRESS",
      completedTests: 1,
      totalTests: 2,
    });

    await publishRunEvent(publisher, testRunId, {
      type: "RUN_COMPLETED",
      status: "completed",
      passedTests: 2,
      failedTests: 0,
    });

    const startMsg = await client.waitForMessage((m) => m.type === "RUN_STARTED");
    expect(startMsg.status).toBe("running");

    const progressMsg = await client.waitForMessage((m) => m.type === "RUN_PROGRESS");
    expect(progressMsg.completedTests).toBe(1);
    expect(progressMsg.totalTests).toBe(2);

    const completedMsg = await client.waitForMessage((m) => m.type === "RUN_COMPLETED");
    expect(completedMsg.status).toBe("completed");
    expect(completedMsg.passedTests).toBe(2);

    await client.close();
  });

  it("should broadcast events to multiple concurrent WebSocket clients connected to the same run", async () => {
    const client1 = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);
    const client2 = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/api/runs/${testRunId}/stream`);

    await client1.waitForMessage((m) => m.type === "CONNECTED");
    await client2.waitForMessage((m) => m.type === "CONNECTED");
    await new Promise((r) => setTimeout(r, 100));

    await publishRunEvent(publisher, testRunId, {
      type: "TEST_COMPLETED",
      endpointId: "multi-ep-1",
      result: { status: "pass" },
    });

    const [msg1, msg2] = await Promise.all([
      client1.waitForMessage((m) => m.endpointId === "multi-ep-1"),
      client2.waitForMessage((m) => m.endpointId === "multi-ep-1"),
    ]);

    expect(msg1.type).toBe("TEST_COMPLETED");
    expect(msg2.type).toBe("TEST_COMPLETED");

    await client1.close();
    await client2.close();
  });

  it("should respond to PING messages with PONG", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);

    await client.waitForMessage((m) => m.type === "CONNECTED");

    client.ws.send(JSON.stringify({ type: "PING" }));

    const pong = await client.waitForMessage((m) => m.type === "PONG");
    expect(pong.type).toBe("PONG");
    expect(pong.timestamp).toBeDefined();

    await client.close();
  });

  it("should cleanly handle client disconnect without uncaught errors", async () => {
    const client = await createTestWebSocketClient(`ws://127.0.0.1:${serverPort}/ws/runs/${testRunId}`);
    await client.waitForMessage((m) => m.type === "CONNECTED");

    // Close abruptly
    await client.close();
    await new Promise((r) => setTimeout(r, 100));

    // Publishing after client disconnect should succeed without errors
    const publishCount = await publishRunEvent(publisher, testRunId, {
      type: "TEST_COMPLETED",
      endpointId: "after-disconnect",
    });

    expect(typeof publishCount).toBe("number");
  });
});
