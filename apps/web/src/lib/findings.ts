import type { TestFinding } from "../types.js";

export type FindingSort = "severity" | "newest" | "slowest";

const SEVERITY_RANK: Record<TestFinding["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const STATUS_RANK: Record<TestFinding["status"], number> = {
  fail: 2,
  warn: 1,
  pass: 0,
};

/**
 * Matches a finding severity against a filter value. "ALL" matches everything
 * and "CRITICAL_HIGH" matches both critical and high findings.
 */
export function matchesSeverityFilter(
  severity: TestFinding["severity"],
  filter: string
): boolean {
  if (filter === "ALL") return true;
  if (filter === "CRITICAL_HIGH") return severity === "critical" || severity === "high";
  return severity.toUpperCase() === filter;
}

function timestamp(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Returns a sorted copy of the findings. "severity" lists failures first and
 * then orders by severity, "newest" orders by creation time, and "slowest"
 * orders by latency with unmeasured findings last.
 */
export function sortFindings(findings: TestFinding[], mode: FindingSort): TestFinding[] {
  const copy = [...findings];
  switch (mode) {
    case "severity":
      return copy.sort(
        (a, b) =>
          STATUS_RANK[b.status] - STATUS_RANK[a.status] ||
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      );
    case "newest":
      return copy.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
    case "slowest":
      return copy.sort(
        (a, b) => (b.latencyMs ?? -1) - (a.latencyMs ?? -1)
      );
  }
}
