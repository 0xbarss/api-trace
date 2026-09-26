import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerErrorHandler, HttpError } from "../plugins/error-handler.js";
import { createTargetSchema } from "../schemas/routes.js";

describe("Centralized Error Handler Plugin", () => {
  it("should return 400 with details when schema validation fails", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);

    app.post("/test-validation", { schema: createTargetSchema }, async () => {
      return { ok: true };
    });

    const response = await app.inject({
      method: "POST",
      url: "/test-validation",
      payload: {
        // missing name, baseUrl, specSource
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toContain("must have required property");
    expect(body.details).toBeDefined();

    await app.close();
  });

  it("should format custom HttpError with correct status code and message", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);

    app.get("/test-not-found", async () => {
      throw new HttpError(404, "Target resource was not found", { id: "123" });
    });

    const response = await app.inject({
      method: "GET",
      url: "/test-not-found",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body).toEqual({
      statusCode: 404,
      error: "Not Found",
      message: "Target resource was not found",
      details: { id: "123" },
    });

    await app.close();
  });

  it("should sanitize unexpected internal errors without leaking stack traces", async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);

    app.get("/test-crash", async () => {
      throw new Error("Secret database credentials leak in stack: user=postgres");
    });

    const response = await app.inject({
      method: "GET",
      url: "/test-crash",
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body).toEqual({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An internal server error occurred",
    });
    expect(response.body).not.toContain("Secret database credentials");
    expect(response.body).not.toContain("stack");

    await app.close();
  });
});
