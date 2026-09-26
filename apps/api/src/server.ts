import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { db as defaultDb, RedisQueue, type Database } from "@apitrace/core";
import type { TestJobPayload } from "@apitrace/planner";
import { registerErrorHandler, HttpError } from "./plugins/error-handler.js";
import { targetsRoutes } from "./routes/targets.js";
import { runsRoutes } from "./routes/runs.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    queue: RedisQueue<TestJobPayload>;
  }
}

export { HttpError };

export interface ServerOptions {
  logger?: boolean;
  db?: Database;
  queue?: RedisQueue<TestJobPayload>;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  const database = options.db ?? defaultDb;
  app.decorate("db", database);

  const queue = options.queue ?? new RedisQueue<TestJobPayload>();
  app.decorate("queue", queue);

  if (!options.queue) {
    app.addHook("onClose", async () => {
      await queue.close();
    });
  }

  registerErrorHandler(app);

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  await app.register(targetsRoutes, { prefix: "/api/targets" });
  await app.register(runsRoutes, { prefix: "/api/runs" });

  return app;
}

