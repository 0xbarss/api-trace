import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
  Key,
  ExternalLink,
} from "lucide-react";
import type { EndpointSummary, TestFinding } from "../types.js";

export interface EndpointScorecardProps {
  endpoints: EndpointSummary[];
  findings: TestFinding[];
  onSelectFinding?: (finding: TestFinding) => void;
}

export function calculateEndpointRiskScore(findings: TestFinding[]): number {
  if (findings.length === 0) return 0;
  let score = 0;
  for (const f of findings) {
    if (f.status === "fail") {
      switch (f.severity) {
        case "critical":
          score += 40;
          break;
        case "high":
          score += 25;
          break;
        case "medium":
          score += 15;
          break;
        case "low":
        default:
          score += 5;
          break;
      }
    } else if (f.status === "warn") {
      score += 10;
    }
  }
  return Math.min(100, score);
}

export function EndpointScorecard({
  endpoints,
  findings,
  onSelectFinding,
}: EndpointScorecardProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ISSUES" | "CLEAN">("ALL");
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());

  // Group findings by endpointId or method+path fallback
  const findingsByEndpoint = useMemo(() => {
    const map = new Map<string, TestFinding[]>();
    for (const f of findings) {
      if (!map.has(f.endpointId)) {
        map.set(f.endpointId, []);
      }
      map.get(f.endpointId)!.push(f);
    }
    return map;
  }, [findings]);

  // Aggregate scorecard per endpoint
  const scorecards = useMemo(() => {
    return endpoints.map((ep) => {
      const epFindings = findingsByEndpoint.get(ep.id) || [];
      const pass = epFindings.filter((f) => f.status === "pass").length;
      const warn = epFindings.filter((f) => f.status === "warn").length;
      const fail = epFindings.filter((f) => f.status === "fail").length;

      const riskScore =
        epFindings.length > 0 ? calculateEndpointRiskScore(epFindings) : ep.riskScore || 0;

      const latencies = epFindings
        .map((f) => f.latencyMs)
        .filter((l): l is number => typeof l === "number" && !isNaN(l))
        .sort((a, b) => a - b);

      const p50 =
        latencies.length > 0
          ? latencies[Math.floor(latencies.length * 0.5)]
          : null;
      const p95 =
        latencies.length > 0
          ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]
          : null;

      return {
        endpoint: ep,
        findings: epFindings,
        pass,
        warn,
        fail,
        total: epFindings.length,
        riskScore,
        p50,
        p95,
      };
    });
  }, [endpoints, findingsByEndpoint]);

  // Filtering
  const filteredScorecards = useMemo(() => {
    return scorecards.filter((sc) => {
      if (methodFilter !== "ALL" && sc.endpoint.method.toUpperCase() !== methodFilter) {
        return false;
      }

      if (statusFilter === "ISSUES" && sc.fail === 0 && sc.warn === 0) {
        return false;
      }
      if (statusFilter === "CLEAN" && (sc.fail > 0 || sc.warn > 0)) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const pathMatches = sc.endpoint.path.toLowerCase().includes(q);
        const opMatches = sc.endpoint.operationId?.toLowerCase().includes(q);
        return pathMatches || Boolean(opMatches);
      }

      return true;
    });
  }, [scorecards, methodFilter, statusFilter, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getMethodBadge = (method: string) => {
    const m = method.toUpperCase();
    switch (m) {
      case "GET":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "POST":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "PUT":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "PATCH":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "DELETE":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  const getAuthBadge = (authType: string) => {
    const a = authType.toLowerCase();
    if (a.includes("bearer") || a.includes("oauth") || a.includes("jwt")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
          <Lock className="w-2.5 h-2.5 text-purple-600" />
          <span>Bearer</span>
        </span>
      );
    }
    if (a.includes("api_key") || a.includes("apikey")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          <Key className="w-2.5 h-2.5 text-blue-600" />
          <span>API Key</span>
        </span>
      );
    }
    if (a.includes("basic")) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
          <Lock className="w-2.5 h-2.5 text-zinc-600" />
          <span>Basic</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-500 border border-zinc-200">
        <Unlock className="w-2.5 h-2.5 text-zinc-400" />
        <span>None</span>
      </span>
    );
  };

  const getRiskScoreBadge = (score: number) => {
    if (score === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
          0/100
        </span>
      );
    }
    if (score <= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-sky-50 text-sky-700 border border-sky-200">
          {score}/100
        </span>
      );
    }
    if (score <= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-50 text-amber-700 border border-amber-200">
          {score}/100
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-rose-50 text-rose-700 border border-rose-200">
        {score}/100
      </span>
    );
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs space-y-0">
      {/* Header and Filter Toolbar */}
      <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Method filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethodFilter(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                methodFilter === m
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "bg-white text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Search & Issue Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search routes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400 font-mono transition-colors"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ISSUES" | "CLEAN")}
            className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 font-medium focus:outline-hidden focus:border-zinc-400"
          >
            <option value="ALL">All statuses</option>
            <option value="ISSUES">Issues found</option>
            <option value="CLEAN">Clean routes</option>
          </select>
        </div>
      </div>

      {/* Scorecard Table */}
      {filteredScorecards.length === 0 ? (
        <div className="p-8 text-center text-zinc-500 text-xs">
          No endpoints match your search.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {filteredScorecards.map((sc) => {
            const isExpanded = expandedEndpoints.has(sc.endpoint.id);

            return (
              <div key={sc.endpoint.id} className="transition-colors hover:bg-zinc-50/50">
                <div
                  onClick={() => toggleExpand(sc.endpoint.id)}
                  className="px-4 py-3 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  {/* Endpoint Method, Path, Auth */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      aria-label="Expand endpoint findings"
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono border ${getMethodBadge(
                        sc.endpoint.method
                      )}`}
                    >
                      {sc.endpoint.method}
                    </span>

                    <span className="font-mono text-zinc-900 font-medium truncate">
                      {sc.endpoint.path}
                    </span>

                    {getAuthBadge(sc.endpoint.authType)}

                    {sc.endpoint.operationId && (
                      <span className="text-[11px] text-zinc-400 font-mono hidden md:inline truncate">
                        ({sc.endpoint.operationId})
                      </span>
                    )}
                  </div>

                  {/* Badges: Probes, Latencies, Risk Score */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto font-mono text-[11px]">
                    {/* Test outcome indicators */}
                    <div className="flex items-center gap-1.5">
                      {sc.pass > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{sc.pass}</span>
                        </span>
                      )}
                      {sc.warn > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>{sc.warn}</span>
                        </span>
                      )}
                      {sc.fail > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>{sc.fail}</span>
                        </span>
                      )}
                      {sc.total === 0 && (
                        <span className="text-zinc-400 text-[10px]">Not run yet</span>
                      )}
                    </div>

                    {/* Latency Pill */}
                    {sc.p50 !== null && (
                      <span className="text-zinc-600 hidden lg:inline">
                        p50: <span className="text-zinc-900 font-semibold">{sc.p50}ms</span>
                        {sc.p95 !== null && (
                          <span className="text-zinc-400 ml-1">
                            (p95: {sc.p95}ms)
                          </span>
                        )}
                      </span>
                    )}

                    {/* Risk Score */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Risk</span>
                      {getRiskScoreBadge(sc.riskScore)}
                    </div>
                  </div>
                </div>

                {/* Expanded Findings Drawer for this Endpoint */}
                {isExpanded && (
                  <div className="px-6 pb-4 pt-2 bg-zinc-50/80 border-t border-zinc-100 space-y-2">
                    <div className="text-[11px] font-mono text-zinc-500 font-semibold uppercase tracking-wider flex items-center justify-between">
                      <span>Tests and findings ({sc.findings.length})</span>
                      <span className="text-zinc-400">Click any finding to inspect details and remediation advice</span>
                    </div>

                    {sc.findings.length === 0 ? (
                      <div className="p-3 text-zinc-400 text-xs italic bg-white rounded-lg border border-zinc-200">
                        No findings recorded for this endpoint yet.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {sc.findings.map((f) => (
                          <div
                            key={f.id}
                            onClick={() => onSelectFinding?.(f)}
                            className="p-2.5 bg-white rounded-lg border border-zinc-200 hover:border-zinc-400 hover:shadow-xs cursor-pointer transition-all flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {f.status === "pass" && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                              {f.status === "warn" && (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              )}
                              {f.status === "fail" && (
                                <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              )}

                              <span className="font-mono font-bold text-zinc-900 truncate">
                                {f.testName}
                              </span>

                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                                {f.category}
                              </span>

                              <span className="text-[11px] text-zinc-500 truncate hidden sm:inline">
                                {f.detail.evidence}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 font-mono text-[11px]">
                              {f.latencyMs !== undefined && f.latencyMs !== null && (
                                <span className="text-zinc-400">
                                  {f.latencyMs}ms
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                  f.severity === "critical"
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : f.severity === "high"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : f.severity === "medium"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-zinc-50 text-zinc-600 border-zinc-200"
                                }`}
                              >
                                {f.severity}
                              </span>
                              <ExternalLink className="w-3 h-3 text-zinc-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
