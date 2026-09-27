import React, { useMemo } from "react";
import { Clock, Zap, Activity, AlertCircle } from "lucide-react";
import type { TestFinding } from "../types.js";

export interface LatencyDistributionProps {
  findings: TestFinding[];
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

export function LatencyDistribution({
  findings,
}: LatencyDistributionProps): React.ReactElement {
  // Extract all valid latency measurements
  const { samples, min, max, avg, p50, p95, p99, histogram, endpointLatencies } = useMemo(() => {
    const latencies: number[] = [];
    const byEndpoint = new Map<string, { method: string; url: string; values: number[] }>();

    for (const f of findings) {
      if (typeof f.latencyMs === "number" && !isNaN(f.latencyMs) && f.latencyMs >= 0) {
        latencies.push(f.latencyMs);

        const method = f.detail.requestSent?.method || "GET";
        const url = f.detail.requestSent?.url || `/endpoint/${f.endpointId}`;
        const key = `${method} ${url}`;

        if (!byEndpoint.has(key)) {
          byEndpoint.set(key, { method, url, values: [] });
        }
        byEndpoint.get(key)!.values.push(f.latencyMs);
      }
    }

    if (latencies.length === 0) {
      return {
        samples: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        histogram: [],
        endpointLatencies: [],
      };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const minVal = sorted[0];
    const maxVal = sorted[count - 1];
    const avgVal = Math.round(sum / count);
    const p50Val = calculatePercentile(sorted, 50);
    const p95Val = calculatePercentile(sorted, 95);
    const p99Val = calculatePercentile(sorted, 99);

    // Dynamic 8-bucket histogram
    const numBuckets = 8;
    const bucketRange = Math.max(1, Math.ceil((maxVal - minVal + 1) / numBuckets));
    const buckets = Array.from({ length: numBuckets }, (_, i) => {
      const start = minVal + i * bucketRange;
      const end = start + bucketRange - 1;
      return {
        label: `${start}-${end}ms`,
        start,
        end,
        count: 0,
      };
    });

    for (const val of sorted) {
      const idx = Math.min(numBuckets - 1, Math.floor((val - minVal) / bucketRange));
      buckets[idx].count++;
    }

    // Endpoint summaries
    const epSummaries = Array.from(byEndpoint.entries()).map(([_, item]) => {
      const epSorted = [...item.values].sort((a, b) => a - b);
      return {
        method: item.method,
        url: item.url,
        samples: item.values.length,
        p50: calculatePercentile(epSorted, 50),
        p95: calculatePercentile(epSorted, 95),
        max: epSorted[epSorted.length - 1],
      };
    });

    // Sort endpoints by highest p95 latency
    epSummaries.sort((a, b) => b.p95 - a.p95);

    return {
      samples: count,
      min: minVal,
      max: maxVal,
      avg: avgVal,
      p50: p50Val,
      p95: p95Val,
      p99: p99Val,
      histogram: buckets,
      endpointLatencies: epSummaries,
    };
  }, [findings]);

  const maxBucketCount = Math.max(1, ...histogram.map((b) => b.count));

  const getLatencyBadgeColor = (ms: number) => {
    if (ms < 100) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (ms < 500) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-rose-700 bg-rose-50 border-rose-200";
  };

  const getLatencyBarColor = (ms: number) => {
    if (ms < 100) return "bg-emerald-500";
    if (ms < 500) return "bg-amber-500";
    return "bg-rose-500";
  };

  if (samples === 0) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3 shadow-xs">
        <div className="inline-flex p-3 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400">
          <Clock className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-zinc-900">No latency data recorded yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Response times will appear here after running tests against this target.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Samples</div>
          <div className="mt-1 text-lg font-bold font-mono text-zinc-900">{samples}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">HTTP requests</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Fastest</div>
          <div className="mt-1 text-lg font-bold font-mono text-emerald-600">{min}ms</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Fastest response</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Median (p50)</div>
          <div className="mt-1 text-lg font-bold font-mono text-zinc-900">{p50}ms</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">50% of requests</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">p95</div>
          <div className="mt-1 text-lg font-bold font-mono text-amber-600">{p95}ms</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">95% of requests</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">p99</div>
          <div className="mt-1 text-lg font-bold font-mono text-rose-600">{p99}ms</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">99% of requests</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Slowest</div>
          <div className="mt-1 text-lg font-bold font-mono text-zinc-900">{max}ms</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Maximum response</div>
        </div>
      </div>

      {/* Latency Distribution Histogram */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
              Response time distribution
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-emerald-500" /> &lt;100ms
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-amber-500" /> 100-500ms
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-rose-500" /> &gt;500ms
            </span>
          </div>
        </div>

        {/* SVG Distribution Chart */}
        <div className="h-44 w-full flex items-end gap-2 pt-6 pb-2 px-2">
          {histogram.map((bucket, i) => {
            const heightPercent = Math.max(8, Math.round((bucket.count / maxBucketCount) * 100));
            const barColor = getLatencyBarColor(bucket.end);

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center h-full justify-end group relative"
              >
                {/* Tooltip */}
                <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-10">
                  {bucket.count} requests ({bucket.label})
                </div>

                <div className="w-full flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-mono text-zinc-400 mb-1 group-hover:text-zinc-800 transition-colors">
                    {bucket.count}
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-sm transition-all duration-300 ${barColor} opacity-85 group-hover:opacity-100`}
                  />
                </div>
                <div className="text-[9px] font-mono text-zinc-400 truncate max-w-full mt-2 text-center">
                  {bucket.start}m
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Endpoint Latency Comparison Breakdown */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
              Endpoint latency
            </h4>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            {endpointLatencies.length} endpoints tested
          </span>
        </div>

        <div className="divide-y divide-zinc-100 overflow-x-auto">
          {endpointLatencies.map((ep, i) => {
            const barWidth = Math.max(5, Math.min(100, Math.round((ep.p95 / Math.max(max, 1)) * 100)));

            return (
              <div
                key={i}
                className="px-5 py-3 hover:bg-zinc-50/70 transition-colors flex items-center justify-between gap-4 text-xs font-mono"
              >
                <div className="flex items-center gap-2.5 min-w-[240px] max-w-[400px]">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 shrink-0">
                    {ep.method}
                  </span>
                  <span className="text-zinc-800 truncate font-medium">{ep.url}</span>
                </div>

                <div className="flex-1 max-w-xs mx-4 hidden sm:block">
                  <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden flex items-center">
                    <div
                      style={{ width: `${barWidth}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${getLatencyBarColor(
                        ep.p95
                      )}`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-zinc-500 text-[11px]">
                    Samples: <span className="text-zinc-800 font-medium">{ep.samples}</span>
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getLatencyBadgeColor(
                      ep.p50
                    )}`}
                  >
                    p50: {ep.p50}ms
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getLatencyBadgeColor(
                      ep.p95
                    )}`}
                  >
                    p95: {ep.p95}ms
                  </span>

                  <span className="text-zinc-400 text-[11px] w-16 text-right">
                    Max: {ep.max}ms
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
