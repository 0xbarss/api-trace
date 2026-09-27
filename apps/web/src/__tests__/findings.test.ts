import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "../api/client.js";
import {
  calculatePercentile,
  LatencyDistribution,
} from "../components/LatencyDistribution.js";
import {
  calculateEndpointRiskScore,
  EndpointScorecard,
} from "../components/EndpointScorecard.js";
import { FindingsView } from "../components/FindingsView.js";
import { FindingModal } from "../components/FindingModal.js";
import type { TestFinding } from "../types.js";

describe("Findings, Scorecard, and Latency Telemetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports FindingsView, FindingModal, EndpointScorecard, and LatencyDistribution cleanly", () => {
    expect(FindingsView).toBeDefined();
    expect(typeof FindingsView).toBe("function");
    expect(FindingModal).toBeDefined();
    expect(typeof FindingModal).toBe("function");
    expect(EndpointScorecard).toBeDefined();
    expect(typeof EndpointScorecard).toBe("function");
    expect(LatencyDistribution).toBeDefined();
    expect(typeof LatencyDistribution).toBe("function");
  });

  describe("Latency percentile calculation", () => {
    it("returns 0 for empty values", () => {
      expect(calculatePercentile([], 50)).toBe(0);
      expect(calculatePercentile([], 95)).toBe(0);
    });

    it("returns exact value for single element", () => {
      expect(calculatePercentile([42], 50)).toBe(42);
      expect(calculatePercentile([42], 95)).toBe(42);
    });

    it("computes p50, p95, and p99 accurately on sorted array", () => {
      // 100 values: 1 to 100
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p50 = calculatePercentile(values, 50);
      const p95 = calculatePercentile(values, 95);
      const p99 = calculatePercentile(values, 99);

      expect(p50).toBe(50);
      expect(p95).toBe(95);
      expect(p99).toBe(99);
    });

    it("handles unsorted arrays correctly", () => {
      const unsorted = [100, 10, 50, 20, 80];
      const p50 = calculatePercentile(unsorted, 50);
      expect(p50).toBe(50);
    });
  });

  describe("Endpoint risk score calculation", () => {
    it("returns 0 for empty findings", () => {
      expect(calculateEndpointRiskScore([])).toBe(0);
    });

    it("returns 0 for all passed findings", () => {
      const passes: TestFinding[] = [
        {
          id: "1",
          runId: "r1",
          endpointId: "e1",
          category: "security",
          testName: "auth-check",
          status: "pass",
          severity: "high",
          latencyMs: 15,
          detail: { evidence: "Authorized cleanly" },
          createdAt: new Date().toISOString(),
        },
      ];
      expect(calculateEndpointRiskScore(passes)).toBe(0);
    });

    it("adds +10 for warnings", () => {
      const warnings: TestFinding[] = [
        {
          id: "1",
          runId: "r1",
          endpointId: "e1",
          category: "security",
          testName: "cors-check",
          status: "warn",
          severity: "medium",
          latencyMs: 20,
          detail: { evidence: "Loose CORS" },
          createdAt: new Date().toISOString(),
        },
      ];
      expect(calculateEndpointRiskScore(warnings)).toBe(10);
    });

    it("calculates weighted risk for various severities", () => {
      const findings: TestFinding[] = [
        {
          id: "1",
          runId: "r1",
          endpointId: "e1",
          category: "security",
          testName: "sqli-probe",
          status: "fail",
          severity: "critical", // +40
          latencyMs: 40,
          detail: { evidence: "SQL syntax error leaked" },
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          runId: "r1",
          endpointId: "e1",
          category: "security",
          testName: "idor-probe",
          status: "fail",
          severity: "high", // +25
          latencyMs: 30,
          detail: { evidence: "Bypassed ownership check" },
          createdAt: new Date().toISOString(),
        },
        {
          id: "3",
          runId: "r1",
          endpointId: "e1",
          category: "contract",
          testName: "schema-validation",
          status: "fail",
          severity: "medium", // +15
          latencyMs: 25,
          detail: { evidence: "Missing required property" },
          createdAt: new Date().toISOString(),
        },
        {
          id: "4",
          runId: "r1",
          endpointId: "e1",
          category: "performance",
          testName: "latency-benchmark",
          status: "warn", // +10
          severity: "low",
          latencyMs: 550,
          detail: { evidence: "Latency exceeded 500ms" },
          createdAt: new Date().toISOString(),
        },
      ];

      // 40 + 25 + 15 + 10 = 90
      expect(calculateEndpointRiskScore(findings)).toBe(90);
    });

    it("clamps maximum risk score to 100", () => {
      const criticalFindings: TestFinding[] = Array.from({ length: 5 }, (_, i) => ({
        id: `f-${i}`,
        runId: "r1",
        endpointId: "e1",
        category: "security",
        testName: `critical-vuln-${i}`,
        status: "fail",
        severity: "critical", // 5 * 40 = 200 -> clamped to 100
        latencyMs: 20,
        detail: { evidence: "Critical vulnerability detected" },
        createdAt: new Date().toISOString(),
      }));

      expect(calculateEndpointRiskScore(criticalFindings)).toBe(100);
    });
  });

  describe("API Client getRunResults", () => {
    it("fetches run findings via HTTP GET", async () => {
      const mockFindings: TestFinding[] = [
        {
          id: "finding-1",
          runId: "run-abc",
          endpointId: "ep-123",
          category: "security",
          testName: "universal-auth-bypass",
          status: "fail",
          severity: "critical",
          latencyMs: 45,
          detail: {
            evidence: "Endpoint returned HTTP 200 without token",
            requestSent: { method: "GET", url: "/api/private" },
            responseReceived: { status: 200 },
            remediation: "Enforce JWT authentication middleware.",
          },
          createdAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockFindings,
      } as Response);

      const results = await apiClient.getRunResults("run-abc");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("finding-1");
      expect(results[0].testName).toBe("universal-auth-bypass");
      expect(results[0].status).toBe("fail");
      expect(results[0].severity).toBe("critical");
      expect(results[0].detail.evidence).toBe("Endpoint returned HTTP 200 without token");
    });

    it("throws a descriptive error when HTTP response fails", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(apiClient.getRunResults("unknown-run")).rejects.toThrow(
        "Could not load run results (HTTP 404)"
      );
    });
  });
});
