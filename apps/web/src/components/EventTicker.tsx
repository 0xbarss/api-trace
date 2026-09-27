import React, { useState, useMemo } from "react";
import {
  Radio,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import type { WebSocketRunEvent, TestFinding } from "../types.js";

export interface EventTickerProps {
  runId: string | null;
  events: WebSocketRunEvent[];
  streaming: boolean;
  onToggleStreaming?: () => void;
  onClearEvents?: () => void;
  onSelectFinding?: (finding: TestFinding) => void;
}

export function EventTicker({
  runId,
  events,
  streaming,
  onToggleStreaming,
  onClearEvents,
  onSelectFinding,
}: EventTickerProps): React.ReactElement {
  const [filterOutcome, setFilterOutcome] = useState<"ALL" | "FAIL" | "WARN" | "PASS">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Extract findings from events
  const findingsList = useMemo(() => {
    return events
      .filter((e) => e.type === "TEST_COMPLETED" && e.result)
      .map((e) => ({
        eventTimestamp: e.timestamp,
        ...e.result!,
      }));
  }, [events]);

  const counts = useMemo(() => {
    let pass = 0;
    let warn = 0;
    let fail = 0;
    for (const f of findingsList) {
      if (f.status === "pass") pass++;
      else if (f.status === "warn") warn++;
      else if (f.status === "fail") fail++;
    }
    return { all: findingsList.length, pass, warn, fail };
  }, [findingsList]);

  const filteredFindings = useMemo(() => {
    return findingsList.filter((item) => {
      if (filterOutcome === "FAIL" && item.status !== "fail") return false;
      if (filterOutcome === "WARN" && item.status !== "warn") return false;
      if (filterOutcome === "PASS" && item.status !== "pass") return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const pathMatch = item.detail.requestSent?.url?.toLowerCase().includes(q);
        const nameMatch = item.testName.toLowerCase().includes(q);
        const catMatch = item.category.toLowerCase().includes(q);
        return pathMatch || nameMatch || catMatch;
      }
      return true;
    });
  }, [findingsList, filterOutcome, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const formatTimestamp = (iso?: string) => {
    if (!iso) return "--:--:--";
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Ticker Header & Controls */}
      <div className="p-3.5 border-b border-zinc-200 bg-zinc-50/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-mono">
              Live Event Ticker
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-mono text-zinc-600">
            <span className={`w-1.5 h-1.5 rounded-full ${streaming ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
            <span>{streaming ? "Streaming" : "Paused"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7.5 w-44 pl-8 pr-2.5 rounded-md bg-white border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
            />
          </div>

          {/* Pause / Resume Button */}
          {onToggleStreaming && (
            <button
              type="button"
              onClick={onToggleStreaming}
              className="h-7.5 px-2.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors inline-flex items-center gap-1.5"
            >
              {streaming ? (
                <>
                  <Pause className="w-3 h-3 text-zinc-600" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                  <span>Resume</span>
                </>
              )}
            </button>
          )}

          {/* Clear Button */}
          {onClearEvents && (
            <button
              type="button"
              onClick={onClearEvents}
              title="Clear event feed"
              className="h-7.5 px-2 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Outcome Category Filters Bar */}
      <div className="px-3.5 py-2 border-b border-zinc-100 bg-white flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterOutcome("ALL")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filterOutcome === "ALL"
                ? "bg-zinc-900 text-white font-semibold"
                : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilterOutcome("FAIL")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              filterOutcome === "FAIL"
                ? "bg-rose-600 text-white font-semibold"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            <XCircle className="w-3 h-3" />
            <span>Failed ({counts.fail})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterOutcome("WARN")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              filterOutcome === "WARN"
                ? "bg-amber-600 text-white font-semibold"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Warnings ({counts.warn})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterOutcome("PASS")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              filterOutcome === "PASS"
                ? "bg-emerald-600 text-white font-semibold"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Passed ({counts.pass})</span>
          </button>
        </div>

        <span className="text-[11px] font-mono text-zinc-400 shrink-0">
          Showing {filteredFindings.length} events
        </span>
      </div>

      {/* Streaming Event Feed List */}
      <div className="divide-y divide-zinc-100 max-h-[480px] min-h-[220px] overflow-y-auto">
        {filteredFindings.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Radio className="w-6 h-6 text-zinc-300 mx-auto animate-pulse" />
            <div className="text-xs text-zinc-500 font-medium">
              {runId
                ? "Waiting for test execution events from runner queue..."
                : "No active test run selected. Start a run to stream live events."}
            </div>
          </div>
        ) : (
          filteredFindings.map((finding) => {
            const isExpanded = expandedIds.has(finding.id);
            const method = finding.detail.requestSent?.method || "GET";
            const urlPath = finding.detail.requestSent?.url
              ? new URL(finding.detail.requestSent.url, "http://localhost").pathname
              : `/endpoint/${finding.endpointId}`;

            return (
              <div
                key={finding.id}
                className={`transition-colors text-xs ${
                  finding.status === "fail"
                    ? "bg-rose-50/20 hover:bg-rose-50/40"
                    : finding.status === "warn"
                    ? "bg-amber-50/20 hover:bg-amber-50/40"
                    : "hover:bg-zinc-50/70"
                }`}
              >
                {/* Event Row Summary */}
                <div
                  onClick={() => toggleExpand(finding.id)}
                  className="p-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button type="button" className="text-zinc-400 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Outcome Icon */}
                    {finding.status === "pass" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    {finding.status === "warn" && (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    {finding.status === "fail" && (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}

                    {/* Timestamp */}
                    <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                      {formatTimestamp(finding.eventTimestamp || finding.createdAt)}
                    </span>

                    {/* Method Badge */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border ${getMethodBadge(
                        method
                      )} shrink-0`}
                    >
                      {method}
                    </span>

                    {/* Endpoint Path */}
                    <span className="font-mono text-zinc-900 font-medium truncate max-w-xs sm:max-w-sm">
                      {urlPath}
                    </span>

                    {/* Test Category / Name */}
                    <span className="hidden md:inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                      {finding.testName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Latency badge */}
                    {finding.latencyMs !== undefined && finding.latencyMs !== null && (
                      <span
                        className={`text-[11px] font-mono font-medium ${
                          finding.latencyMs > 500
                            ? "text-rose-600"
                            : finding.latencyMs > 250
                            ? "text-amber-600"
                            : "text-zinc-500"
                        }`}
                      >
                        {finding.latencyMs}ms
                      </span>
                    )}

                    {/* Severity pill if fail or warn */}
                    {finding.status !== "pass" && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold font-mono ${
                          finding.severity === "critical" || finding.severity === "high"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {finding.severity}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expandable Finding Detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-1 space-y-3 bg-white/70 border-t border-zinc-100">
                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-2 text-xs">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                          Evidence
                        </div>
                        <p className="mt-0.5 text-zinc-800 leading-relaxed font-mono text-[11px]">
                          {finding.detail.evidence}
                        </p>
                      </div>

                      {finding.detail.remediation && (
                        <div className="pt-2 border-t border-zinc-200/60">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-emerald-600" />
                            <span>Remediation Guidance</span>
                          </div>
                          <p className="mt-0.5 text-zinc-700 leading-relaxed text-[11px]">
                            {finding.detail.remediation}
                          </p>
                        </div>
                      )}

                      {finding.detail.requestSent && (
                        <div className="pt-2 border-t border-zinc-200/60 font-mono text-[11px] text-zinc-600">
                          <span className="text-zinc-400">Request:</span>{" "}
                          <span className="text-zinc-900 font-semibold">
                            {finding.detail.requestSent.method}
                          </span>{" "}
                          <span>{finding.detail.requestSent.url}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
