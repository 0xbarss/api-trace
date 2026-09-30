import { describe, it, expect } from "vitest";
import { formatRelativeTime, safePathname } from "../lib/format.js";
import { matchesSeverityFilter, sortFindings } from "../lib/findings.js";
import { computeRunRate, formatDuration } from "../lib/run-stats.js";
import type { TestFinding } from "../types.js";

function makeFinding(overrides: Partial<TestFinding>): TestFinding {
  return {
    id: "f1",
    runId: "r1",
    endpointId: "e1",
    category: "security",
    testName: "sample",
    status: "pass",
    severity: "info",
    latencyMs: null,
    detail: { evidence: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-01T12:00:00.000Z").getTime();

  it("formats recent and older timestamps", () => {
    expect(formatRelativeTime("2026-06-01T11:59:40.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-06-01T11:55:00.000Z", now)).toBe("5m ago");
    expect(formatRelativeTime("2026-06-01T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelativeTime("2026-05-29T12:00:00.000Z", now)).toBe("3d ago");
    expect(formatRelativeTime("2026-03-01T12:00:00.000Z", now)).toBe("3mo ago");
  });

  it("returns unknown for invalid input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("unknown");
  });
});

describe("safePathname", () => {
  it("extracts the pathname from absolute URLs and paths", () => {
    expect(safePathname("https://api.example.com/users/1?x=2", "/fallback")).toBe("/users/1");
    expect(safePathname("/orders", "/fallback")).toBe("/orders");
  });

  it("uses the fallback when no URL was recorded", () => {
    expect(safePathname(undefined, "/fallback")).toBe("/fallback");
  });
});

describe("matchesSeverityFilter", () => {
  it("supports the combined critical and high filter", () => {
    expect(matchesSeverityFilter("critical", "CRITICAL_HIGH")).toBe(true);
    expect(matchesSeverityFilter("high", "CRITICAL_HIGH")).toBe(true);
    expect(matchesSeverityFilter("medium", "CRITICAL_HIGH")).toBe(false);
  });

  it("matches single severities and ALL", () => {
    expect(matchesSeverityFilter("low", "LOW")).toBe(true);
    expect(matchesSeverityFilter("low", "HIGH")).toBe(false);
    expect(matchesSeverityFilter("info", "ALL")).toBe(true);
  });
});

describe("sortFindings", () => {
  const findings = [
    makeFinding({ id: "pass", status: "pass", severity: "info", latencyMs: 900 }),
    makeFinding({ id: "warn", status: "warn", severity: "medium", latencyMs: 50, createdAt: "2026-03-01T00:00:00.000Z" }),
    makeFinding({ id: "fail-high", status: "fail", severity: "high", latencyMs: null, createdAt: "2026-02-01T00:00:00.000Z" }),
    makeFinding({ id: "fail-crit", status: "fail", severity: "critical", latencyMs: 200 }),
  ];

  it("orders failures first, then by severity", () => {
    expect(sortFindings(findings, "severity").map((f) => f.id)).toEqual([
      "fail-crit",
      "fail-high",
      "warn",
      "pass",
    ]);
  });

  it("orders by newest first", () => {
    expect(sortFindings(findings, "newest").map((f) => f.id)[0]).toBe("warn");
  });

  it("orders slowest first with unmeasured findings last", () => {
    const ids = sortFindings(findings, "slowest").map((f) => f.id);
    expect(ids[0]).toBe("pass");
    expect(ids[ids.length - 1]).toBe("fail-high");
  });

  it("does not mutate the input array", () => {
    const before = findings.map((f) => f.id);
    sortFindings(findings, "severity");
    expect(findings.map((f) => f.id)).toEqual(before);
  });
});

describe("computeRunRate", () => {
  it("returns nulls before any test completes", () => {
    expect(computeRunRate(0, 10, 5)).toEqual({ perSecond: null, etaSeconds: null });
    expect(computeRunRate(3, 10, 0)).toEqual({ perSecond: null, etaSeconds: null });
  });

  it("derives throughput and remaining time", () => {
    const rate = computeRunRate(10, 30, 5);
    expect(rate.perSecond).toBe(2);
    expect(rate.etaSeconds).toBe(10);
  });

  it("reports zero time remaining when finished", () => {
    expect(computeRunRate(30, 30, 10).etaSeconds).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 5s");
  });
});
