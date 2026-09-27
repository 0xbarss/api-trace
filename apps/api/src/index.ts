import { buildServer } from "./server.js";
import { TestExecutionWorker } from "./services/worker-service.js";

export * from "./server.js";
export * from "./types.js";
export * from "./routes/websocket.js";
export * from "./services/worker-service.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "0.0.0.0";

  const app = await buildServer({ logger: true });

  const worker = new TestExecutionWorker(
    app.db,
    app.queue,
    app.queue.getClient()
  );
  worker.start();
  app.log.info("Test execution background worker started");

  const shutdown = async () => {
    app.log.info("Gracefully shutting down server and queue worker...");
    await worker.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  try {
    await app.listen({ port, host });
    app.log.info(`API server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    await worker.stop();
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
