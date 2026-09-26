import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import type { WebSocket } from "ws";
import { testRuns } from "@apitrace/core";
import type { RunParams, WebSocketRunEvent } from "../types.js";

export const RUN_EVENTS_CHANNEL_PREFIX = "apitrace:events:";

export function getRunEventsChannel(runId: string): string {
  return `${RUN_EVENTS_CHANNEL_PREFIX}${runId}`;
}

export async function publishRunEvent(
  redis: Redis,
  runId: string,
  event: WebSocketRunEvent
): Promise<number> {
  const channel = getRunEventsChannel(runId);
  const payload = JSON.stringify({
    runId,
    timestamp: event.timestamp ?? new Date().toISOString(),
    ...event,
  });
  return await redis.publish(channel, payload);
}

export async function handleRunWebSocket(
  socket: WebSocket,
  request: FastifyRequest<{ Params: RunParams }>
): Promise<void> {
  const { id: runId } = request.params;
  const fastify = request.server;

  const [run] = await fastify.db
    .select()
    .from(testRuns)
    .where(eq(testRuns.id, runId));

  if (!run) {
    if (socket.readyState === socket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          error: "Not Found",
          message: `Test run with id '${runId}' not found`,
        })
      );
      socket.close(1008, "Run not found");
    }
    return;
  }

  if (socket.readyState === socket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "CONNECTED",
        runId: run.id,
        status: run.status,
        totalTests: run.totalTests,
        completedTests: run.completedTests,
        timestamp: new Date().toISOString(),
      })
    );
  }

  const subscriber = fastify.createRedisSubscriber();
  const channel = getRunEventsChannel(runId);

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      await subscriber.unsubscribe(channel);
    } catch {
      // ignore unsubscribe errors during teardown
    }
    try {
      await subscriber.quit();
    } catch {
      try {
        subscriber.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  };

  socket.on("close", () => {
    void cleanup();
  });

  socket.on("error", () => {
    void cleanup();
  });

  subscriber.on("message", (chan: string, message: string) => {
    if (chan === channel && socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  });

  socket.on("message", (rawMessage: unknown) => {
    try {
      const text = String(rawMessage).trim();
      if (text.toUpperCase() === "PING") {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "PONG",
              timestamp: new Date().toISOString(),
            })
          );
        }
        return;
      }
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.type === "PING") {
        if (socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "PONG",
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    } catch {
      // ignore non-JSON messages
    }
  });

  await subscriber.subscribe(channel);
}

export const websocketRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: RunParams }>(
    "/runs/:id",
    { websocket: true },
    (socket, request) => {
      void handleRunWebSocket(socket, request);
    }
  );
};
