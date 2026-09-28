import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TestJobPayload } from "@apitrace/planner";
import {
  HttpProbeClient,
  HttpProbeError,
  interpolatePath,
  buildSampleBody,
  truncate,
  runAuthMissingCheck,
  runAuthMalformedCheck,
  runBolaUnauthorizedAccessCheck,
  runBflaPrivilegeEscalationCheck,
  runMassAssignmentProbe,
  runCorsWildcardCheck,
  runRateLimitBurstCheck,
  runInfoLeakageCheck,
  runInjectionSignalProbe,
  runLatencyBaselineCheck,
  runOpenApiSchemaConformance,
  runStatusCodeDeclaredCheck,
  runBusinessLogicStateInjectionProbe,
  runSensitiveDataExposureCheck,
  executeTestJob,
  registeredRunners,
} from "../index.js";

describe("Test Engine & Probe Suite", () => {
  let server: Server;
  let baseUrl: string;
  let probeClient: HttpProbeClient;
  let burstCounter = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Rate limit test endpoint
      if (pathname === "/rate-limited") {
        burstCounter++;
        if (burstCounter > 10) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Too Many Requests" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathname === "/unthrottled") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // Protected route
      if (pathname === "/protected-route") {
        const auth = req.headers["authorization"];
        if (!auth) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        if (auth.includes("invalid_malformed")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid token" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "authenticated" }));
        return;
      }

      // Insecure route (allows unauthorized access)
      if (pathname === "/insecure-route") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "insecure_access" }));
        return;
      }

      // Dual-tenant object access route for BOLA testing
      if (pathname.startsWith("/tenant-objects/")) {
        const auth = req.headers["authorization"];
        if (!auth) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        // Insecure BOLA simulation: any caller with a token sees the resource
        if (url.searchParams.get("vulnerable") === "true") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: pathname.replace("/tenant-objects/", ""), secret: "leaked_data" }));
          return;
        }
        if (auth === "Bearer token-a") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: pathname.replace("/tenant-objects/", ""), owner: "tenant-a" }));
          return;
        }
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }

      // Administrative route for BFLA testing
      if (pathname === "/admin/audit-search") {
        const auth = req.headers["authorization"];
        if (!auth) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        // Insecure BFLA simulation: any authenticated caller reaches the admin route
        if (url.searchParams.get("vulnerable") === "true") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ logs: [] }));
          return;
        }
        if (auth === "Bearer admin-token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ logs: [] }));
          return;
        }
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }

      // Administrative route that rejects with the wrong status code
      if (pathname === "/admin/legacy-metrics") {
        const auth = req.headers["authorization"];
        if (auth === "Bearer admin-token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ metrics: [] }));
          return;
        }
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Mass assignment endpoint
      if (pathname === "/mass-assignment-vulnerable") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          const parsed = JSON.parse(body || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...parsed, updated: true }));
        });
        return;
      }

      if (pathname === "/mass-assignment-safe") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ name: "SafeUser", updated: true }));
        });
        return;
      }

      // CORS testing
      if (pathname === "/cors-insecure") {
        const origin = req.headers["origin"];
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": String(origin),
          "Access-Control-Allow-Credentials": "true",
        });
        res.end(JSON.stringify({ cors: "insecure" }));
        return;
      }

      if (pathname === "/cors-safe") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://trusted-domain.com",
        });
        res.end(JSON.stringify({ cors: "safe" }));
        return;
      }

      // Error trace leakage endpoint
      if (pathname === "/error-leak") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error: QueryFailedError: syntax error at or near 'SELECT'\n    at Database.query (/app/db.js:14:5)");
        return;
      }

      if (pathname === "/error-safe") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid payload format" }));
        return;
      }

      // Injection probe endpoint
      if (pathname === "/injection-endpoint") {
        const query = url.searchParams.get("q") ?? "";
        if (query.includes("' OR '1'='1")) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Fatal error: syntax error at or near 'OR' at SQLSTATE[42601]");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results: [] }));
        return;
      }

      // Contract schema endpoints
      if (pathname === "/contract/valid") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: 101, username: "john_doe", active: true }));
        return;
      }

      if (pathname === "/contract/invalid-types") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "not-a-number", username: 12345, active: "invalid_bool" }));
        return;
      }

      if (pathname === "/contract/non-json") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Not a JSON document</body></html>");
        return;
      }

      if (pathname === "/contract/server-error") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal crash" }));
        return;
      }

      if (pathname === "/perf/slow") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ slow: true }));
        }, 30);
        return;
      }

      // Mass assignment: accepts numeric financial fields when authenticated
      if (pathname === "/balance-assignment-vulnerable") {
        const auth = req.headers["authorization"];
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          if (auth) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ updated: true }));
          } else {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
          }
        });
        return;
      }

      // Info leakage via query param on a GET-only endpoint
      if (pathname === "/audit/search") {
        const q = url.searchParams.get("q") ?? "";
        if (q.includes("'")) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("SqliteError: near \"OR\": syntax error\n    at StatementSync.all (/app/db.js:10:5)");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results: [] }));
        return;
      }

      // Business logic state injection: accepts any POST body and returns 200
      if (pathname === "/transfers-vulnerable") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ created: true }));
        });
        return;
      }

      if (pathname === "/transfers-safe") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
          if ("status" in parsed || "approved" in parsed) {
            res.writeHead(422, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unexpected field" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ created: true }));
        });
        return;
      }

      // Sensitive data exposure: returns a raw PAN
      if (pathname === "/cards-exposed") {
        const auth = req.headers["authorization"];
        if (!auth) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ pan: "4111111111111111", "cvv": "123" }]));
        return;
      }

      if (pathname === "/cards-masked") {
        const auth = req.headers["authorization"];
        if (!auth) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ pan: "****1111", last4: "1111" }]));
        return;
      }

      // Default 200 response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Default response" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    probeClient = new HttpProbeClient();
  });

  afterAll(async () => {
    await probeClient.close();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("Utility Functions", () => {
    it("interpolatePath substitutes path parameters correctly", () => {
      const path = "/users/{id}/orders/{orderId}";
      const interpolated = interpolatePath(
        path,
        [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "orderId", in: "path", required: true, schema: { format: "uuid" } },
        ]
      );
      expect(interpolated).toBe("/users/1/orders/00000000-0000-0000-0000-000000000001");
    });

    it("interpolatePath respects parameter overrides", () => {
      const path = "/users/{userId}";
      const interpolated = interpolatePath(path, undefined, { userId: "custom-999" });
      expect(interpolated).toBe("/users/custom-999");
    });

    it("buildSampleBody constructs sample payload from JSON Schema", () => {
      const sample = buildSampleBody({
        type: "object",
        required: ["name", "age", "active"],
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
          active: { type: "boolean" },
        },
      });

      expect(sample).toEqual({
        name: "test",
        age: 1,
        active: true,
      });
    });

    it("truncate limits string length safely", () => {
      const longText = "a".repeat(600);
      const truncated = truncate(longText, 100);
      expect(truncated.length).toBeLessThan(longText.length);
      expect(truncated).toContain("[truncated]");
    });
  });

  describe("HttpProbeClient", () => {
    it("sends requests and returns normalized headers and JSON", async () => {
      const res = await probeClient.send(baseUrl, {
        method: "GET",
        path: "/contract/valid",
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.json).toEqual({ id: 101, username: "john_doe", active: true });
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("formats query parameters cleanly", () => {
      const formatted = probeClient.buildUrl(baseUrl, "/items", { page: 2, sort: "desc" });
      expect(formatted).toBe(`${baseUrl}/items?page=2&sort=desc`);
    });

    it("throws HttpProbeError on connection to closed address", async () => {
      const deadClient = new HttpProbeClient({ timeoutMs: 1000 });
      await expect(
        deadClient.send("http://127.0.0.1:59999", { path: "/nonexistent" })
      ).rejects.toThrow(HttpProbeError);
      await deadClient.close();
    });
  });

  describe("Security Probes", () => {
    const baseJob: TestJobPayload = {
      runId: "run-1",
      targetId: "target-1",
      endpointId: "ep-1",
      baseUrl: "",
      method: "GET",
      path: "/protected-route",
      authType: "bearer",
      parameters: [],
      category: "security",
      testName: "auth_missing_token",
    };

    it("auth_missing_token passes when protected route returns 401", async () => {
      const result = await runAuthMissingCheck(
        { ...baseJob, baseUrl, path: "/protected-route" },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
      expect(result.detail.evidence).toContain("Correctly rejected unauthenticated request");
    });

    it("auth_missing_token fails when route allows anonymous access", async () => {
      const result = await runAuthMissingCheck(
        { ...baseJob, baseUrl, path: "/insecure-route" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
      expect(result.detail.evidence).toContain("returned HTTP 200 without credentials");
    });

    it("auth_malformed_token passes when route rejects invalid Bearer token", async () => {
      const result = await runAuthMalformedCheck(
        { ...baseJob, baseUrl, path: "/protected-route" },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    const authProfiles = {
      primary: { name: "Tenant A", token: "token-a" },
      secondary: { name: "Tenant B", token: "token-b" },
    };

    it("bola_unauthorized_object_access warns when target has no auth profiles configured", async () => {
      const result = await runBolaUnauthorizedAccessCheck(
        { ...baseJob, baseUrl, path: "/tenant-objects/{id}" },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.detail.evidence).toContain("Skipped: this target has no Tenant A and Tenant B auth profiles");
    });

    it("bola_unauthorized_object_access fails when secondary tenant accesses the primary tenant's resource", async () => {
      const result = await runBolaUnauthorizedAccessCheck(
        { ...baseJob, baseUrl, path: "/tenant-objects/{id}?vulnerable=true", config: { authProfiles } },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
      expect(result.detail.evidence).toContain("was able to read a resource that belongs to");
    });

    it("bola_unauthorized_object_access passes when secondary tenant is rejected with 403", async () => {
      const result = await runBolaUnauthorizedAccessCheck(
        { ...baseJob, baseUrl, path: "/tenant-objects/{id}", config: { authProfiles } },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("bola_unauthorized_object_access warns when the primary baseline request fails", async () => {
      const result = await runBolaUnauthorizedAccessCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/tenant-objects/{id}",
          config: {
            authProfiles: {
              primary: { name: "Tenant A", token: "wrong-token" },
              secondary: authProfiles.secondary,
            },
          },
        },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.detail.evidence).toContain("Couldn't get a baseline");
    });

    it("bfla_privilege_escalation warns when target has no caller profile configured", async () => {
      const result = await runBflaPrivilegeEscalationCheck(
        { ...baseJob, baseUrl, path: "/admin/audit-search" },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.detail.evidence).toContain("Skipped: this target has no Unprivileged or Tenant B auth profile");
    });

    it("bfla_privilege_escalation fails when an unprivileged token reaches the admin route", async () => {
      const result = await runBflaPrivilegeEscalationCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/admin/audit-search?vulnerable=true",
          config: { authProfiles: { unprivileged: { name: "Regular User", token: "user-token" } } },
        },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
    });

    it("bfla_privilege_escalation passes when the admin route rejects with 403", async () => {
      const result = await runBflaPrivilegeEscalationCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/admin/audit-search",
          config: { authProfiles: { unprivileged: { name: "Regular User", token: "user-token" } } },
        },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("bfla_privilege_escalation warns when the admin route rejects with the wrong status code", async () => {
      const result = await runBflaPrivilegeEscalationCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/admin/legacy-metrics",
          config: { authProfiles: { unprivileged: { name: "Regular User", token: "user-token" } } },
        },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.detail.evidence).toContain("instead of the HTTP 403 you'd expect");
    });

    it("mass_assignment_probe detects vulnerability when admin attributes are echoed", async () => {
      const result = await runMassAssignmentProbe(
        { ...baseJob, baseUrl, method: "POST", path: "/mass-assignment-vulnerable" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
      expect(result.detail.evidence).toContain("mass assignment");
    });

    it("mass_assignment_probe passes when unauthorized properties are sanitized", async () => {
      const result = await runMassAssignmentProbe(
        { ...baseJob, baseUrl, method: "POST", path: "/mass-assignment-safe" },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("cors_wildcard_check fails when arbitrary origin is reflected with credentials", async () => {
      const result = await runCorsWildcardCheck(
        { ...baseJob, baseUrl, path: "/cors-insecure" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
    });

    it("cors_wildcard_check passes when safe origin is configured", async () => {
      const result = await runCorsWildcardCheck(
        { ...baseJob, baseUrl, path: "/cors-safe" },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("rate_limit_burst_presence detects 429 throttling under concurrency burst", async () => {
      burstCounter = 0;
      const result = await runRateLimitBurstCheck(
        { ...baseJob, baseUrl, path: "/rate-limited", config: { burstCount: 15 } },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("rate_limit_burst_presence warns when no rate limiting is detected", async () => {
      const result = await runRateLimitBurstCheck(
        { ...baseJob, baseUrl, path: "/unthrottled", config: { burstCount: 5 } },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.severity).toBe("medium");
    });

    it("info_leakage_error_traces detects internal stack traces", async () => {
      const result = await runInfoLeakageCheck(
        { ...baseJob, baseUrl, path: "/error-leak" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
      expect(result.detail.evidence).toContain("leaked internal trace");
    });

    it("info_leakage_error_traces passes on clean error response", async () => {
      const result = await runInfoLeakageCheck(
        { ...baseJob, baseUrl, path: "/error-safe" },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("injection_signal_probe detects database syntax error leakage", async () => {
      const result = await runInjectionSignalProbe(
        { ...baseJob, baseUrl, path: "/injection-endpoint" },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
      expect(result.detail.evidence).toContain("syntax error");
    });

    it("mass_assignment_probe detects numeric financial field injection when authenticated", async () => {
      const authProfiles = {
        primary: { name: "User A", token: "token-a" },
      };
      const result = await runMassAssignmentProbe(
        {
          ...baseJob,
          baseUrl,
          method: "PUT",
          path: "/balance-assignment-vulnerable",
          config: { authProfiles },
        },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
      expect(result.detail.evidence).toContain("attacker-supplied values");
    });

    it("info_leakage_error_traces detects stack trace via query param on GET endpoint", async () => {
      const result = await runInfoLeakageCheck(
        {
          ...baseJob,
          baseUrl,
          method: "GET",
          path: "/audit/search",
          parameters: [{ name: "q", in: "query", required: false }],
        },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
      expect(result.detail.evidence).toContain("via query parameter");
    });

    it("business_logic_state_injection fails when endpoint accepts state override fields", async () => {
      const result = await runBusinessLogicStateInjectionProbe(
        {
          ...baseJob,
          baseUrl,
          method: "POST",
          path: "/transfers-vulnerable",
          requestSchema: { type: "object", properties: { amount: { type: "number" } } },
        },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
      expect(result.detail.evidence).toContain("state machine");
    });

    it("business_logic_state_injection passes when endpoint rejects state override fields", async () => {
      const result = await runBusinessLogicStateInjectionProbe(
        {
          ...baseJob,
          baseUrl,
          method: "POST",
          path: "/transfers-safe",
          requestSchema: { type: "object", properties: { amount: { type: "number" } } },
        },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });

    it("sensitive_data_exposure warns when no auth profile is configured", async () => {
      const result = await runSensitiveDataExposureCheck(
        { ...baseJob, baseUrl, path: "/cards-exposed" },
        probeClient
      );
      expect(result.status).toBe("warn");
      expect(result.detail.evidence).toContain("no primary auth profile");
    });

    it("sensitive_data_exposure fails when a raw PAN is returned in the response", async () => {
      const result = await runSensitiveDataExposureCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/cards-exposed",
          config: { authProfiles: { primary: { name: "User A", token: "token-a" } } },
        },
        probeClient
      );
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("critical");
      expect(result.detail.evidence).toContain("unmasked payment card number");
    });

    it("sensitive_data_exposure passes when only masked card data is returned", async () => {
      const result = await runSensitiveDataExposureCheck(
        {
          ...baseJob,
          baseUrl,
          path: "/cards-masked",
          config: { authProfiles: { primary: { name: "User A", token: "token-a" } } },
        },
        probeClient
      );
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
    });
  });

  describe("Performance Probes", () => {
    it("measures baseline latency distribution over multiple samples", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/contract/valid",
        authType: "none",
        parameters: [],
        category: "performance",
        testName: "latency_baseline_distribution",
        config: { sampleCount: 5, latencyThresholdMs: 2000 },
      };

      const result = await runLatencyBaselineCheck(job, probeClient);
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
      expect(result.detail.evidence).toContain("p50=");
      expect(result.detail.evidence).toContain("p95=");
      expect(result.detail.evidence).toContain("p99=");
    });

    it("warns when p95 exceeds latency threshold", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/perf/slow",
        authType: "none",
        parameters: [],
        category: "performance",
        testName: "latency_baseline_distribution",
        config: { sampleCount: 3, latencyThresholdMs: 15 },
      };

      const result = await runLatencyBaselineCheck(job, probeClient);
      expect(result.status).toBe("warn");
      expect(result.severity).toBe("medium");
      expect(result.detail.remediation).toBeDefined();
    });
  });

  describe("Contract Probes", () => {
    const responseSchema = {
      type: "object",
      required: ["id", "username", "active"],
      properties: {
        id: { type: "integer" },
        username: { type: "string" },
        active: { type: "boolean" },
      },
    };

    it("openapi_schema_conformance passes when response body matches schema", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/contract/valid",
        authType: "none",
        parameters: [],
        responseSchema,
        category: "contract",
        testName: "openapi_schema_conformance",
      };

      const result = await runOpenApiSchemaConformance(job, probeClient);
      expect(result.status).toBe("pass");
      expect(result.severity).toBe("info");
      expect(result.detail.evidence).toContain("adheres to OpenAPI contract");
    });

    it("openapi_schema_conformance fails when response body deviates from schema", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/contract/invalid-types",
        authType: "none",
        parameters: [],
        responseSchema,
        category: "contract",
        testName: "openapi_schema_conformance",
      };

      const result = await runOpenApiSchemaConformance(job, probeClient);
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("medium");
      expect(result.detail.evidence).toContain("deviates from OpenAPI contract");
    });

    it("openapi_schema_conformance fails when non-JSON body is returned", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/contract/non-json",
        authType: "none",
        parameters: [],
        responseSchema,
        category: "contract",
        testName: "openapi_schema_conformance",
      };

      const result = await runOpenApiSchemaConformance(job, probeClient);
      expect(result.status).toBe("fail");
      expect(result.detail.evidence).toContain("unparseable");
    });

    it("status_code_declared_check fails on HTTP 500 error", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/contract/server-error",
        authType: "none",
        parameters: [],
        category: "contract",
        testName: "status_code_declared_check",
      };

      const result = await runStatusCodeDeclaredCheck(job, probeClient);
      expect(result.status).toBe("fail");
      expect(result.severity).toBe("high");
    });
  });

  describe("Unified Runner Dispatcher & Catalogue", () => {
    it("exposes registered runners catalogue", () => {
      expect(registeredRunners.length).toBeGreaterThanOrEqual(13);
      const names = registeredRunners.map((r) => r.name);
      expect(names).toContain("auth_missing_token");
      expect(names).toContain("latency_baseline_distribution");
      expect(names).toContain("openapi_schema_conformance");
      expect(names).toContain("business_logic_state_injection");
      expect(names).toContain("sensitive_data_exposure");
    });

    it("dispatches job across categories via executeTestJob", async () => {
      const job: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl,
        method: "GET",
        path: "/protected-route",
        authType: "bearer",
        parameters: [],
        category: "security",
        testName: "auth_missing_token",
      };

      const result = await executeTestJob(job, undefined, probeClient);
      expect(result.status).toBe("pass");
    });

    it("handles connection failure gracefully returning error status", async () => {
      const deadJob: TestJobPayload = {
        runId: "run-1",
        targetId: "target-1",
        endpointId: "ep-1",
        baseUrl: "http://127.0.0.1:59998",
        method: "GET",
        path: "/endpoint",
        authType: "none",
        parameters: [],
        category: "security",
        testName: "auth_missing_token",
      };

      const result = await executeTestJob(deadJob);
      expect(result.status).toBe("error");
      expect(result.detail.evidence).toContain("Probe HTTP request failed");
    });
  });
});
