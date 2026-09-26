import type { TestJobPayload } from "@apitrace/planner";
import type { TestExecutionResult } from "../types.js";
import type { HttpProbeClient } from "../http/client.js";
import { interpolatePath } from "../utils.js";

export function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

export async function runLatencyBaselineCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const sampleCount = typeof job.config?.sampleCount === "number" ? job.config.sampleCount : 20;
  const thresholdMs =
    typeof job.config?.latencyThresholdMs === "number"
      ? job.config.latencyThresholdMs
      : 1000;

  const latencies: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    try {
      const res = await client.send(job.baseUrl, {
        method: job.method,
        path,
      });
      latencies.push(res.latencyMs);
    } catch {
      latencies.push(5000);
    }
  }

  latencies.sort((a, b) => a - b);

  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);

  const isDegraded = p95 > thresholdMs;

  return {
    status: isDegraded ? "warn" : "pass",
    severity: isDegraded ? "medium" : "info",
    latencyMs: p50,
    detail: {
      evidence: `Latency distribution over ${sampleCount} samples: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      remediation: isDegraded
        ? `Optimize database queries, indexing, or caching on this endpoint as p95 (${p95}ms) exceeds ${thresholdMs}ms threshold.`
        : undefined,
    },
  };
}

export async function runPerformanceProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  switch (job.testName) {
    case "latency_baseline_distribution":
    default:
      return runLatencyBaselineCheck(job, client);
  }
}
