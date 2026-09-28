import { describe, it, expect } from "vitest";
import type { TargetAuthProfiles } from "@apitrace/core";
import {
  generateEndpointJobs,
  generateTestPlan,
  isAuthRequired,
  hasIdInPath,
  isMutatingWithBody,
  isAdminRoute,
  hasQueryParamsOrBody,
  matrixRules,
  type PlannerEndpointInput,
} from "../index.js";

describe("Test Plan Generator & Matrix Rules", () => {
  const defaultRunId = "00000000-0000-0000-0000-000000000001";
  const defaultTargetId = "00000000-0000-0000-0000-000000000002";
  const defaultBaseUrl = "https://api.example.com";

  describe("Rule Predicates", () => {
    it("isAuthRequired returns true for non-empty schemes and false for none/empty", () => {
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test", authType: "bearer" })).toBe(true);
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test", authType: "apiKey" })).toBe(true);
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test", authType: "none" })).toBe(false);
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test", authType: "NONE" })).toBe(false);
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test", authType: "" })).toBe(false);
      expect(isAuthRequired({ id: "1", method: "GET", path: "/test" })).toBe(false);
    });

    it("hasIdInPath detects ID parameters via parameter declarations and path tokens", () => {
      expect(
        hasIdInPath({
          id: "1",
          method: "GET",
          path: "/users/{userId}",
          parameters: [{ name: "userId", in: "path", required: true }],
        })
      ).toBe(true);

      expect(
        hasIdInPath({
          id: "1",
          method: "GET",
          path: "/orders/{order_id}",
          parameters: [{ name: "order_id", in: "path", required: true }],
        })
      ).toBe(true);

      expect(
        hasIdInPath({
          id: "1",
          method: "GET",
          path: "/accounts/{id}",
        })
      ).toBe(true);

      expect(
        hasIdInPath({
          id: "1",
          method: "GET",
          path: "/categories/{slug}",
          parameters: [{ name: "slug", in: "path", required: true }],
        })
      ).toBe(false);
    });

    it("isAdminRoute detects administrative, audit, and system route segments", () => {
      expect(isAdminRoute({ id: "1", method: "GET", path: "/api/v1/admin/users" })).toBe(true);
      expect(isAdminRoute({ id: "1", method: "GET", path: "/api/v1/audit/search" })).toBe(true);
      expect(isAdminRoute({ id: "1", method: "GET", path: "/api/v1/system/metrics" })).toBe(true);
      expect(isAdminRoute({ id: "1", method: "GET", path: "/api/v1/accounts/{id}" })).toBe(false);
    });

    it("isMutatingWithBody matches POST, PUT, PATCH with requestSchema", () => {
      const schema = { type: "object" };
      expect(isMutatingWithBody({ id: "1", method: "POST", path: "/items", requestSchema: schema })).toBe(true);
      expect(isMutatingWithBody({ id: "1", method: "put", path: "/items/1", requestSchema: schema })).toBe(true);
      expect(isMutatingWithBody({ id: "1", method: "PATCH", path: "/items/1", requestSchema: schema })).toBe(true);
      expect(isMutatingWithBody({ id: "1", method: "GET", path: "/items", requestSchema: schema })).toBe(false);
      expect(isMutatingWithBody({ id: "1", method: "POST", path: "/items", requestSchema: null })).toBe(false);
    });

    it("hasQueryParamsOrBody detects query parameters or body schema", () => {
      expect(
        hasQueryParamsOrBody({
          id: "1",
          method: "GET",
          path: "/search",
          parameters: [{ name: "q", in: "query", required: false }],
        })
      ).toBe(true);

      expect(
        hasQueryParamsOrBody({
          id: "1",
          method: "POST",
          path: "/search",
          requestSchema: { type: "object" },
        })
      ).toBe(true);

      expect(
        hasQueryParamsOrBody({
          id: "1",
          method: "GET",
          path: "/health",
        })
      ).toBe(false);
    });
  });

  describe("Endpoint Matrix Generation", () => {
    it("generates universal security, performance, and contract baseline tests for public GET endpoint", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-public-1",
        method: "GET",
        path: "/health",
        authType: "none",
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint);
      const testNames = jobs.map((j) => j.testName);

      expect(testNames).toContain("cors_wildcard_check");
      expect(testNames).toContain("rate_limit_burst_presence");
      expect(testNames).toContain("info_leakage_error_traces");
      expect(testNames).toContain("latency_baseline_distribution");
      expect(testNames).toContain("status_code_declared_check");

      expect(testNames).not.toContain("auth_missing_token");
      expect(testNames).not.toContain("auth_malformed_token");
      expect(testNames).not.toContain("bola_unauthorized_object_access");
      expect(testNames).not.toContain("mass_assignment_probe");
      expect(testNames).not.toContain("injection_signal_probe");
      expect(testNames).not.toContain("polyglot_fuzz_injection_matrix");
      expect(testNames).not.toContain("openapi_schema_conformance");
    });

    it("generates authentication and BOLA tests for protected resource route with ID parameter", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-user-1",
        method: "GET",
        path: "/users/{id}",
        authType: "bearer",
        parameters: [{ name: "id", in: "path", required: true }],
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint);
      const testNames = jobs.map((j) => j.testName);

      expect(testNames).toContain("auth_missing_token");
      expect(testNames).toContain("auth_malformed_token");
      expect(testNames).toContain("bola_unauthorized_object_access");
      expect(testNames).toContain("cors_wildcard_check");
      expect(testNames).toContain("rate_limit_burst_presence");
      expect(testNames).toContain("latency_baseline_distribution");
    });

    it("generates a BFLA test for admin route paths regardless of their authType", () => {
      const authFreeAdminEndpoint: PlannerEndpointInput = {
        id: "ep-admin-auth-free",
        method: "GET",
        path: "/api/v1/audit/search",
        authType: "none",
      };
      const authRequiredAdminEndpoint: PlannerEndpointInput = {
        id: "ep-admin-1",
        method: "GET",
        path: "/api/v1/audit/search",
        authType: "bearer",
      };
      const regularEndpoint: PlannerEndpointInput = {
        id: "ep-regular-1",
        method: "GET",
        path: "/api/v1/accounts/{id}",
        authType: "bearer",
        parameters: [{ name: "id", in: "path", required: true }],
      };

      const authFreeJobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, authFreeAdminEndpoint);
      const authRequiredJobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, authRequiredAdminEndpoint);
      const regularJobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, regularEndpoint);

      expect(authFreeJobs.map((j) => j.testName)).toContain("bfla_privilege_escalation");
      expect(authRequiredJobs.map((j) => j.testName)).toContain("bfla_privilege_escalation");
      expect(regularJobs.map((j) => j.testName)).not.toContain("bfla_privilege_escalation");
    });

    it("generates business_logic_state_injection for mutating endpoints with a request schema", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-transfers",
        method: "POST",
        path: "/api/v1/transfers",
        authType: "bearer",
        requestSchema: { type: "object", properties: { amount: { type: "number" } } },
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint);
      expect(jobs.map((j) => j.testName)).toContain("business_logic_state_injection");
    });

    it("generates sensitive_data_exposure for authenticated GET endpoints with a response schema", () => {
      const authenticatedGetWithSchema: PlannerEndpointInput = {
        id: "ep-cards",
        method: "GET",
        path: "/api/v1/cards",
        authType: "bearer",
        responseSchema: { type: "array", items: { type: "object" } },
      };
      const unauthenticated: PlannerEndpointInput = {
        id: "ep-public",
        method: "GET",
        path: "/api/v1/public",
        authType: "none",
        responseSchema: { type: "object" },
      };
      const noSchema: PlannerEndpointInput = {
        id: "ep-no-schema",
        method: "GET",
        path: "/api/v1/accounts",
        authType: "bearer",
      };

      expect(
        generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, authenticatedGetWithSchema)
          .map((j) => j.testName)
      ).toContain("sensitive_data_exposure");

      expect(
        generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, unauthenticated)
          .map((j) => j.testName)
      ).not.toContain("sensitive_data_exposure");

      expect(
        generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, noSchema)
          .map((j) => j.testName)
      ).not.toContain("sensitive_data_exposure");
    });


    it("carries target auth profiles into BOLA and BFLA job config", () => {
      const authProfiles: TargetAuthProfiles = {
        primary: { name: "Tenant A", token: "token-a" },
        secondary: { name: "Tenant B", token: "token-b" },
      };
      const endpoint: PlannerEndpointInput = {
        id: "ep-bola-1",
        method: "GET",
        path: "/api/v1/admin/audit",
        authType: "bearer",
        parameters: [{ name: "id", in: "path", required: true }],
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint, {
        authProfiles,
      });

      const bolaJob = jobs.find((j) => j.testName === "bola_unauthorized_object_access");
      const bflaJob = jobs.find((j) => j.testName === "bfla_privilege_escalation");
      expect(bolaJob?.config?.authProfiles).toEqual(authProfiles);
      expect(bflaJob?.config?.authProfiles).toEqual(authProfiles);
    });

    it("generates mass assignment and injection probes for mutating endpoint with request schema", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-post-1",
        method: "POST",
        path: "/orders",
        authType: "apiKey",
        requestSchema: {
          type: "object",
          properties: {
            quantity: { type: "integer" },
            productId: { type: "string" },
          },
        },
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint);
      const testNames = jobs.map((j) => j.testName);

      expect(testNames).toContain("mass_assignment_probe");
      expect(testNames).toContain("injection_signal_probe");
      expect(testNames).toContain("polyglot_fuzz_injection_matrix");
      expect(testNames).toContain("auth_missing_token");
      expect(testNames).toContain("auth_malformed_token");
    });

    it("generates openapi schema conformance check when responseSchema is declared", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-res-schema",
        method: "GET",
        path: "/products",
        responseSchema: {
          type: "array",
          items: { type: "object" },
        },
      };

      const jobs = generateEndpointJobs(defaultRunId, defaultTargetId, defaultBaseUrl, endpoint);
      const testNames = jobs.map((j) => j.testName);

      expect(testNames).toContain("openapi_schema_conformance");
    });

    it("filters generated jobs by category when specified in options", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-filter-1",
        method: "POST",
        path: "/users",
        authType: "bearer",
        requestSchema: { type: "object" },
        responseSchema: { type: "object" },
      };

      const securityJobs = generateEndpointJobs(
        defaultRunId,
        defaultTargetId,
        defaultBaseUrl,
        endpoint,
        { categories: ["security"] }
      );
      expect(securityJobs.every((j) => j.category === "security")).toBe(true);
      expect(securityJobs.length).toBeGreaterThan(0);

      const perfJobs = generateEndpointJobs(
        defaultRunId,
        defaultTargetId,
        defaultBaseUrl,
        endpoint,
        { categories: ["performance"] }
      );
      expect(perfJobs.every((j) => j.category === "performance")).toBe(true);
      expect(perfJobs).toHaveLength(1);
      expect(perfJobs[0].testName).toBe("latency_baseline_distribution");
    });

    it("honors enabledTests and disabledTests filters", () => {
      const endpoint: PlannerEndpointInput = {
        id: "ep-filter-2",
        method: "GET",
        path: "/health",
      };

      const enabledOnly = generateEndpointJobs(
        defaultRunId,
        defaultTargetId,
        defaultBaseUrl,
        endpoint,
        { enabledTests: ["cors_wildcard_check", "status_code_declared_check"] }
      );
      expect(enabledOnly).toHaveLength(2);
      expect(enabledOnly.map((j) => j.testName)).toEqual([
        "cors_wildcard_check",
        "status_code_declared_check",
      ]);

      const disabledSome = generateEndpointJobs(
        defaultRunId,
        defaultTargetId,
        defaultBaseUrl,
        endpoint,
        { disabledTests: ["cors_wildcard_check"] }
      );
      expect(disabledSome.map((j) => j.testName)).not.toContain("cors_wildcard_check");
    });

    it("throws if endpoint is missing required identifier fields", () => {
      expect(() =>
        generateEndpointJobs(
          defaultRunId,
          defaultTargetId,
          defaultBaseUrl,
          { id: "", method: "GET", path: "/test" }
        )
      ).toThrow("Endpoint must have id, method, and path defined");
    });
  });

  describe("Batch Test Plan Generation", () => {
    it("generates a unified test plan across an array of endpoints", () => {
      const endpoints: PlannerEndpointInput[] = [
        {
          id: "ep-1",
          method: "GET",
          path: "/health",
        },
        {
          id: "ep-2",
          method: "GET",
          path: "/users/{id}",
          authType: "bearer",
          parameters: [{ name: "id", in: "path", required: true }],
          responseSchema: { type: "object" },
        },
        {
          id: "ep-3",
          method: "POST",
          path: "/orders",
          authType: "apiKey",
          requestSchema: { type: "object" },
          responseSchema: { type: "object" },
        },
      ];

      const plan = generateTestPlan({
        runId: defaultRunId,
        targetId: defaultTargetId,
        baseUrl: defaultBaseUrl,
        endpoints,
      });

      expect(plan.length).toBeGreaterThan(15);
      const ep1Jobs = plan.filter((j) => j.endpointId === "ep-1");
      const ep2Jobs = plan.filter((j) => j.endpointId === "ep-2");
      const ep3Jobs = plan.filter((j) => j.endpointId === "ep-3");

      expect(ep1Jobs.length).toBeGreaterThan(0);
      expect(ep2Jobs.length).toBeGreaterThan(0);
      expect(ep3Jobs.length).toBeGreaterThan(0);

      // Verify payloads contain common identifiers
      for (const job of plan) {
        expect(job.runId).toBe(defaultRunId);
        expect(job.targetId).toBe(defaultTargetId);
        expect(job.baseUrl).toBe(defaultBaseUrl);
        expect(job.method).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/);
      }
    });
  });
});
