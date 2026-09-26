import { buildServer } from "./server.js";

export * from "./server.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "0.0.0.0";

  const app = await buildServer({ logger: true });

  try {
    await app.listen({ port, host });
    app.log.info(`API server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
