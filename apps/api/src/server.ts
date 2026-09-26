import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerErrorHandler, HttpError } from "./plugins/error-handler.js";

export { HttpError };

export interface ServerOptions {
  logger?: boolean;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  registerErrorHandler(app);

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
