import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

export interface ServerOptions {
  logger?: boolean;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
