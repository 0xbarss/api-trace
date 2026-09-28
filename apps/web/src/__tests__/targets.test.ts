import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
        responses: { "200": { description: "Success" } },
      },
    },
  },
});

describe("Target Catalog & API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with target inventory array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const targets = await apiClient.listTargets();
    expect(targets).toBeDefined();
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBe(0);
  });

  it("ingests an OpenAPI target and returns creation response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        targetId: "target-123",
        discoveredEndpointsCount: 4,
      }),
    } as Response);

    const res = await apiClient.createTarget({
      name: "Acme Payments API",
      baseUrl: "https://api.acmepayments.com",
      specSource: VALID_OPENAPI_SPEC,
    });

    expect(res.targetId).toBe("target-123");
    expect(res.discoveredEndpointsCount).toBe(4);
  });

  it("fetches target detail with discovered endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "target-456",
        name: "Auth Service",
        baseUrl: "https://auth.example.com",
        specSource: VALID_OPENAPI_SPEC,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endpoints: [
          {
            id: "ep-1",
            targetId: "target-456",
            method: "GET",
            path: "/api/users",
            operationId: "getUsers",
            authType: "none",
            parameters: [],
            riskScore: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    } as Response);

    const detail = await apiClient.getTarget("target-456");
    expect(detail).toBeDefined();
    expect(detail.id).toBe("target-456");
    expect(detail.name).toBe("Auth Service");
    expect(detail.endpoints.length).toBe(1);
    expect(detail.endpoints[0].method).toBe("GET");
  });

  it("triggers a test run for a target", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        runId: "run-789",
        totalTests: 12,
        status: "queued",
      }),
    } as Response);

    const runRes = await apiClient.triggerRun("target-456", {
      categories: ["security", "performance", "contract"],
    });

    expect(runRes).toBeDefined();
    expect(runRes.runId).toBe("run-789");
    expect(runRes.totalTests).toBe(12);
    expect(runRes.status).toBe("queued");
  });

  it("deletes a target from the catalog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        id: "target-456",
      }),
    } as Response);

    const deleteRes = await apiClient.deleteTarget("target-456");
    expect(deleteRes.success).toBe(true);
    expect(deleteRes.id).toBe("target-456");
  });

  it("saves auth profiles with PUT and returns the token-free summary", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ primary: { name: "Tenant A", hasToken: true } }),
    } as Response);

    const summary = await apiClient.updateAuthProfiles("target-1", {
      primary: { name: "Tenant A", token: "secret" },
    });

    expect(summary.primary).toEqual({ name: "Tenant A", hasToken: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/targets/target-1/auth-profiles");
    expect(init?.method).toBe("PUT");
  });

  it("surfaces the server message when saving auth profiles fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "Every auth profile needs a name and a token" }),
    } as Response);

    await expect(
      apiClient.updateAuthProfiles("target-1", { primary: { name: "", token: "" } })
    ).rejects.toThrow("needs a name and a token");
  });
});
