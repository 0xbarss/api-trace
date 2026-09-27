import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiClient } from "../api/client.js";

const VALID_OPENAPI_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: {
    title: "Test API Gateway",
    version: "1.0.0",
    description: "Sample test API",
  },
  paths: {
    "/api/users": {
      get: {
        operationId: "getUsers",
        summary: "List users",
        responses: {
          "200": {
            description: "Success",
          },
        },
      },
      post: {
        operationId: "createUser",
        summary: "Create user",
        responses: {
          "201": {
            description: "Created",
          },
        },
      },
    },
    "/api/users/{id}": {
      get: {
        operationId: "getUserById",
        summary: "Get single user",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "User details",
          },
        },
      },
    },
  },
});

describe("Target Catalog & API Client", () => {
  beforeAll(() => {
    // Isolate tests so they do not mutate the live database
    apiClient.setBaseUrl("http://127.0.0.1:59999");
  });

  afterAll(() => {
    apiClient.setBaseUrl("http://127.0.0.1:3001");
  });

  it("starts with target inventory array", async () => {
    const targets = await apiClient.listTargets();
    expect(targets).toBeDefined();
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBe(0);
  });

  it("ingests an OpenAPI target and lists it in catalog", async () => {
    const res = await apiClient.createTarget({
      name: "Acme Payments API",
      baseUrl: "https://api.acmepayments.com",
      specSource: VALID_OPENAPI_SPEC,
    });

    expect(res.targetId).toBeDefined();
    expect(res.discoveredEndpointsCount).toBeGreaterThan(0);

    const targets = await apiClient.listTargets();
    const created = targets.find((t) => t.id === res.targetId);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Acme Payments API");
    expect(created?.baseUrl).toBe("https://api.acmepayments.com");
  });

  it("fetches target detail with discovered endpoints", async () => {
    const res = await apiClient.createTarget({
      name: "Auth Service",
      baseUrl: "https://auth.example.com",
      specSource: VALID_OPENAPI_SPEC,
    });

    const detail = await apiClient.getTarget(res.targetId);
    expect(detail).toBeDefined();
    expect(detail.id).toBe(res.targetId);
    expect(detail.name).toBe("Auth Service");
    expect(detail.endpoints.length).toBeGreaterThan(0);

    const firstEp = detail.endpoints[0];
    expect(firstEp).toBeDefined();
    expect(firstEp.method).toBeDefined();
    expect(firstEp.path).toBeDefined();
  });

  it("triggers a test run for a target", async () => {
    const res = await apiClient.createTarget({
      name: "Orders Service",
      baseUrl: "https://orders.example.com",
      specSource: VALID_OPENAPI_SPEC,
    });

    const runRes = await apiClient.triggerRun(res.targetId, {
      categories: ["security", "performance", "contract"],
    });

    expect(runRes).toBeDefined();
    expect(runRes.runId).toBeDefined();
    expect(runRes.totalTests).toBeGreaterThan(0);
    expect(runRes.status).toBe("queued");
  });

  it("deletes a target from the catalog", async () => {
    const res = await apiClient.createTarget({
      name: "Temporary Service To Delete",
      baseUrl: "https://temp.example.com",
      specSource: VALID_OPENAPI_SPEC,
    });

    const deleteRes = await apiClient.deleteTarget(res.targetId);
    expect(deleteRes.success).toBe(true);
    expect(deleteRes.id).toBe(res.targetId);

    const targetsAfterDelete = await apiClient.listTargets();
    const found = targetsAfterDelete.find((t) => t.id === res.targetId);
    expect(found).toBeUndefined();
  });
});
