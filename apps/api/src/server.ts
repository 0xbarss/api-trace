import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  db as defaultDb,
  RedisQueue,
  createRedisClient,
  type Database,
} from "@apitrace/core";
import type { Redis } from "ioredis";
import type { TestJobPayload } from "@apitrace/planner";
import { registerErrorHandler, HttpError } from "./plugins/error-handler.js";
import { targetsRoutes } from "./routes/targets.js";
import { runsRoutes } from "./routes/runs.js";
import { websocketRoutes, publishRunEvent } from "./routes/websocket.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    queue: RedisQueue<TestJobPayload>;
    createRedisSubscriber: () => Redis;
  }
}

export { HttpError, publishRunEvent, websocketRoutes };

export interface ServerOptions {
  logger?: boolean;
  db?: Database;
  queue?: RedisQueue<TestJobPayload>;
  createSubscriber?: () => Redis;
  redisUrl?: string;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  const database = options.db ?? defaultDb;
  app.decorate("db", database);

  const queue = options.queue ?? new RedisQueue<TestJobPayload>();
  app.decorate("queue", queue);

  const subscriberFactory =
    options.createSubscriber ?? (() => createRedisClient(options.redisUrl));
  app.decorate("createRedisSubscriber", subscriberFactory);

  if (!options.queue) {
    app.addHook("onClose", async () => {
      await queue.close();
    });
  }

  registerErrorHandler(app);

  await app.register(cors, {
    origin: true,
  });

  await app.register(websocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  await app.register(targetsRoutes, { prefix: "/api/targets" });
  await app.register(runsRoutes, { prefix: "/api/runs" });
  await app.register(websocketRoutes, { prefix: "/ws" });

  return app;
}


