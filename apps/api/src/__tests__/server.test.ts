import { describe, it, expect } from "vitest";
import { buildServer } from "../server.js";

describe("Fastify Server initialization", () => {
  it("should respond with ok on /health route", async () => {
    const app = await buildServer({ logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
