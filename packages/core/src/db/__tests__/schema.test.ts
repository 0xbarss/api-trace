import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../client.js";
import { targets, endpoints, testRuns, testResults } from "../schema.js";

describe("Database Schema & Client", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("should create, read, and cascade delete target with endpoints and runs", async () => {
    const [target] = await db
      .insert(targets)
      .values({
        name: "Test API Target",
        baseUrl: "https://api.example.com",
        specSource: "https://api.example.com/openapi.json",
      })
      .returning();

    expect(target).toBeDefined();
    expect(target.id).toBeDefined();
    expect(target.name).toBe("Test API Target");

    const [endpoint] = await db
      .insert(endpoints)
      .values({
        targetId: target.id,
        method: "GET",
        path: "/api/items",
        operationId: "listItems",
        authType: "bearer",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" },
          },
        ],
      })
      .returning();

    expect(endpoint.id).toBeDefined();
    expect(endpoint.targetId).toBe(target.id);
    expect(endpoint.parameters).toHaveLength(1);

    const [run] = await db
      .insert(testRuns)
      .values({
        targetId: target.id,
        status: "running",
        totalTests: 1,
      })
      .returning();

    expect(run.id).toBeDefined();
    expect(run.targetId).toBe(target.id);

    const [result] = await db
      .insert(testResults)
      .values({
        runId: run.id,
        endpointId: endpoint.id,
        category: "security",
        testName: "auth_missing_token",
        status: "pass",
        severity: "high",
        latencyMs: 45,
        detail: {
          evidence: "Endpoint rejected request with 401 Unauthorized",
        },
      })
      .returning();

    expect(result.id).toBeDefined();
    expect(result.detail.evidence).toBe("Endpoint rejected request with 401 Unauthorized");

    // Verify cascade deletion
    await db.delete(targets).where(eq(targets.id, target.id));

    const remainingEndpoints = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, endpoint.id));
    expect(remainingEndpoints).toHaveLength(0);

    const remainingRuns = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, run.id));
    expect(remainingRuns).toHaveLength(0);

    const remainingResults = await db
      .select()
      .from(testResults)
      .where(eq(testResults.id, result.id));
    expect(remainingResults).toHaveLength(0);
  });
});
