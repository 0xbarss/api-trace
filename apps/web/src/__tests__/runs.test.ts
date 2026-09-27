import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../api/client.js";
import { RunVisualizer } from "../components/RunVisualizer.js";
import { EventTicker } from "../components/EventTicker.js";
import type { WebSocketRunEvent } from "../types.js";

describe("Live Run Visualizer & WebSocket Event Ticker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports RunVisualizer and EventTicker components cleanly", () => {
    expect(RunVisualizer).toBeDefined();
    expect(typeof RunVisualizer).toBe("function");
    expect(EventTicker).toBeDefined();
    expect(typeof EventTicker).toBe("function");
  });

  it("triggers and returns a queued test run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        runId: "run-test-123",
        totalTests: 12,
        status: "queued",
      }),
    } as Response);

    const res = await apiClient.triggerRun("target-test-123");
    expect(res).toBeDefined();
    expect(res.runId).toBe("run-test-123");
    expect(res.totalTests).toBe(12);
    expect(res.status).toBe("queued");
  });

  it("lists existing test runs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "run-1",
          targetId: "target-1",
          status: "completed",
          totalTests: 10,
          completedTests: 10,
          passedTests: 9,
          failedTests: 1,
          warningTests: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    } as Response);

    const runs = await apiClient.listRuns();
    expect(runs).toBeDefined();
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.length).toBe(1);

    const firstRun = runs[0];
    expect(firstRun.id).toBe("run-1");
    expect(firstRun.totalTests).toBe(10);
  });

  it("fetches individual run details by id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "run-1",
        targetId: "target-1",
        status: "completed",
        totalTests: 10,
        completedTests: 10,
        passedTests: 9,
        failedTests: 1,
        warningTests: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    } as Response);

    const run = await apiClient.getRun("run-1");
    expect(run).toBeDefined();
    expect(run.id).toBe("run-1");
    expect(run.status).toBe("completed");
  });

  it("subscribes to live WebSocket run stream and receives execution events", async () => {
    const receivedEvents: WebSocketRunEvent[] = [];

    class MockWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      readyState = 1;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      send = vi.fn();
      close = vi.fn();

      constructor(public url: string) {
        queueMicrotask(() => {
          if (this.onmessage) {
            this.onmessage({
              data: JSON.stringify({
                type: "CONNECTED",
                runId: "run-1",
                status: "running",
                totalTests: 10,
                completedTests: 0,
              }),
            } as MessageEvent);
          }
        });
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocket);

    await new Promise<void>((resolve) => {
      let unsub: (() => void) | null = null;
      unsub = apiClient.subscribeRunStream("run-1", (event) => {
        receivedEvents.push(event);
        if (event.type === "CONNECTED") {
          if (unsub) unsub();
          resolve();
        }
      });

      setTimeout(() => {
        if (unsub) unsub();
        resolve();
      }, 500);
    });

    vi.unstubAllGlobals();

    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(receivedEvents[0].type).toBe("CONNECTED");
    expect(receivedEvents[0].runId).toBe("run-1");
  });
});
