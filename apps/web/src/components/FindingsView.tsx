import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  BarChart2,
  ListFilter,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  FileDown,
} from "lucide-react";
import type {
  RunSummary,
  TestFinding,
  EndpointSummary,
  TargetSummary,
} from "../types.js";
import { EndpointScorecard } from "./EndpointScorecard.js";
import { LatencyDistribution } from "./LatencyDistribution.js";
import { FindingModal } from "./FindingModal.js";
import { apiClient } from "../api/client.js";
import { useExport } from "../hooks/useExport.js";

export interface FindingsViewProps {
  runs: RunSummary[];
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  targets: TargetSummary[];
}

export function FindingsView({
  runs,
  activeRunId,
  onSelectRun,
  targets,
}: FindingsViewProps): React.ReactElement {
  const [activeSubTab, setActiveSubTab] = useState<"scorecard" | "drilldown" | "latency">(
    "scorecard"
  );
  const [findings, setFindings] = useState<TestFinding[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<TestFinding | null>(null);

  // Drilldown filters
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const activeRun = runs.find((r) => r.id === activeRunId) || runs[0] || null;
  const activeTarget = targets.find((t) => t.id === activeRun?.targetId);

  // Fetch run results and target endpoints whenever activeRunId changes
  useEffect(() => {
    if (!activeRun?.id) {
      setFindings([]);
      setEndpoints([]);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    Promise.all([
      apiClient.getRunResults(activeRun.id).catch((err) => {
        console.error("Failed to load run results:", err);
        return [] as TestFinding[];
      }),
      apiClient.getTarget(activeRun.targetId).catch((err) => {
        console.warn("Failed to load target details:", err);
        return null;
      }),
    ])
      .then(([results, targetDetail]) => {
        if (isCancelled) return;
        setFindings(results);
        if (targetDetail && targetDetail.endpoints) {
          setEndpoints(targetDetail.endpoints);
        } else {
          // Synthesize minimal endpoints if target details not found
          const synthesized: EndpointSummary[] = [];
          const seen = new Set<string>();
          for (const f of results) {
            if (!seen.has(f.endpointId)) {
              seen.add(f.endpointId);
              synthesized.push({
                id: f.endpointId,
                targetId: activeRun.targetId,
                method: f.detail.requestSent?.method || "GET",
                path: f.detail.requestSent?.url || `/endpoint/${f.endpointId}`,
                authType: "none",
                parameters: [],
                riskScore: 0,
                createdAt: f.createdAt,
              });
            }
          }
          setEndpoints(synthesized);
        }
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeRun?.id, activeRun?.targetId]);

  // Aggregate metric counts
  const metrics = useMemo(() => {
    let pass = 0;
    let warn = 0;
    let fail = 0;
    let critical = 0;
    let high = 0;

    for (const f of findings) {
      if (f.status === "pass") pass++;
      else if (f.status === "warn") warn++;
      else if (f.status === "fail") fail++;

      if (f.severity === "critical") critical++;
      else if (f.severity === "high") high++;
    }

    return { total: findings.length, pass, warn, fail, critical, high };
  }, [findings]);

  // Filtered findings for drilldown view
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (statusFilter !== "ALL" && f.status.toUpperCase() !== statusFilter) return false;
      if (severityFilter !== "ALL" && f.severity.toUpperCase() !== severityFilter) return false;
      if (categoryFilter !== "ALL" && f.category.toUpperCase() !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const testMatch = f.testName.toLowerCase().includes(q);
        const urlMatch = f.detail.requestSent?.url?.toLowerCase().includes(q);
        const evidenceMatch = f.detail.evidence.toLowerCase().includes(q);
        return testMatch || Boolean(urlMatch) || evidenceMatch;
      }

      return true;
    });
  }, [findings, statusFilter, severityFilter, categoryFilter, searchQuery]);

  const { exportJson, exportCsv } = useExport(filteredFindings, activeRun?.id ?? null);

  const getMethodBadge = (method?: string) => {
    const m = (method || "GET").toUpperCase();
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

  if (runs.length === 0) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-3 shadow-xs">
        <div className="inline-flex p-3 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400">
          <ShieldAlert className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-zinc-900">No test runs yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Security findings, contract checks, and response times will appear here after you run a test.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Run Selector */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-900 text-white shadow-xs">
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Target
            </div>
            <div className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <span>{activeTarget?.name || "Unknown Target"}</span>
              {activeTarget?.baseUrl && (
                <span className="text-xs font-mono font-normal text-zinc-500 truncate max-w-xs">
                  ({activeTarget.baseUrl})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Run Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="run-select" className="text-xs font-mono text-zinc-500 shrink-0">
            Run:
          </label>
          <div className="relative">
            <select
              id="run-select"
              value={activeRun?.id || ""}
              onChange={(e) => onSelectRun(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono font-medium text-zinc-800 focus:outline-hidden focus:border-zinc-400 cursor-pointer"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)} • {r.status.toUpperCase()} ({r.completedTests} tests)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Total tests</div>
          <div className="mt-1 text-lg font-bold font-mono text-zinc-900">{metrics.total}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Executed checks</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Passed</div>
          <div className="mt-1 text-lg font-bold font-mono text-emerald-600">{metrics.pass}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Passed checks</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Warnings</div>
          <div className="mt-1 text-lg font-bold font-mono text-amber-600">{metrics.warn}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Non-blocking notices</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Failed</div>
          <div className="mt-1 text-lg font-bold font-mono text-rose-600">{metrics.fail}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Failed checks</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Critical / High</div>
          <div className="mt-1 text-lg font-bold font-mono text-rose-700">
            {metrics.critical + metrics.high}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">High priority</div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab("scorecard")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors ${
            activeSubTab === "scorecard"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Scorecard ({endpoints.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("drilldown")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors ${
            activeSubTab === "drilldown"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>Findings ({findings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("latency")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors ${
            activeSubTab === "latency"
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Latency distribution</span>
        </button>
      </div>

      {/* Sub-view Content */}
      {loading ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-xs font-mono text-zinc-500">
          Loading findings...
        </div>
      ) : (
        <>
          {activeSubTab === "scorecard" && (
            <EndpointScorecard
              endpoints={endpoints}
              findings={findings}
              onSelectFinding={(f) => setSelectedFinding(f)}
            />
          )}

          {activeSubTab === "drilldown" && (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs space-y-0">
              {/* Filter Toolbar */}
              <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Status filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 font-mono font-medium focus:outline-hidden"
                  >
                    <option value="ALL">All outcomes</option>
                    <option value="FAIL">Failed only</option>
                    <option value="WARN">Warnings only</option>
                    <option value="PASS">Passed only</option>
                  </select>

                  {/* Severity filter */}
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 font-mono font-medium focus:outline-hidden"
                  >
                    <option value="ALL">All severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                    <option value="INFO">Info</option>
                  </select>

                  {/* Category filter */}
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 font-mono font-medium focus:outline-hidden"
                  >
                    <option value="ALL">All categories</option>
                    <option value="SECURITY">Security</option>
                    <option value="PERFORMANCE">Performance</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </div>

                {/* Text search */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search findings or routes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-mono placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-400"
                  />
                </div>

                {/* Export buttons */}
                {filteredFindings.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={exportJson}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-mono font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      title="Export visible findings as JSON"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-mono font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                      title="Export visible findings as CSV"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      CSV
                    </button>
                  </div>
                )}
              </div>

              {/* Finding Items List */}
              {filteredFindings.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-500 font-mono">
                  No findings match your filters.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {filteredFindings.map((finding) => (
                    <div
                      key={finding.id}
                      onClick={() => setSelectedFinding(finding)}
                      className="p-3.5 hover:bg-zinc-50/70 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {finding.status === "pass" && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        {finding.status === "warn" && (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        {finding.status === "fail" && (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}

                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border ${getMethodBadge(
                            finding.detail.requestSent?.method
                          )}`}
                        >
                          {finding.detail.requestSent?.method || "GET"}
                        </span>

                        <span className="font-mono text-zinc-800 truncate max-w-xs">
                          {finding.detail.requestSent?.url || `/endpoint/${finding.endpointId}`}
                        </span>

                        <span className="font-mono font-bold text-zinc-900 truncate">
                          {finding.testName}
                        </span>

                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                          {finding.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto font-mono text-[11px]">
                        {finding.latencyMs !== undefined && finding.latencyMs !== null && (
                          <span className="text-zinc-500">
                            {finding.latencyMs}ms
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            finding.severity === "critical"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : finding.severity === "high"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : finding.severity === "medium"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-zinc-50 text-zinc-600 border-zinc-200"
                          }`}
                        >
                          {finding.severity}
                        </span>

                        <ExternalLink className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-700 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === "latency" && (
            <LatencyDistribution findings={findings} />
          )}
        </>
      )}

      {/* Finding Details Modal */}
      <FindingModal
        finding={selectedFinding}
        isOpen={Boolean(selectedFinding)}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}
