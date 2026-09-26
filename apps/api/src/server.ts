import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { db as defaultDb, type Database } from "@apitrace/core";
import { registerErrorHandler, HttpError } from "./plugins/error-handler.js";
import { targetsRoutes } from "./routes/targets.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export { HttpError };

export interface ServerOptions {
  logger?: boolean;
  db?: Database;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  const database = options.db ?? defaultDb;
  app.decorate("db", database);

  registerErrorHandler(app);

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  await app.register(targetsRoutes, { prefix: "/api/targets" });

  return app;
}
