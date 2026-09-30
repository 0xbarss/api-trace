import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Server,
  Play,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Search,
  Plus,
  Lock,
  Unlock,
  Key,
  X,
  Layers,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Clock,
  XCircle,
  CheckCircle2,
  ArrowRight,
  ArrowUpDown,
  Copy,
  Check,
} from "lucide-react";
import type { TargetSummary, TargetDetail, EndpointSummary, AuthProfilesInput, RunSummary } from "../types.js";
import { AuthProfilesModal } from "./AuthProfilesModal.js";
import { Dialog } from "./Dialog.js";
import { formatRelativeTime } from "../lib/format.js";

type TargetSort = "recent" | "name" | "risk" | "endpoints";

interface TargetCatalogProps {
  targets: TargetSummary[];
  runs: RunSummary[];
  loading: boolean;
  onOpenIngestModal: () => void;
  onDeleteTarget: (id: string) => Promise<void>;
  onTriggerRun: (targetId: string) => Promise<void>;
  onSelectTarget: (id: string) => Promise<TargetDetail>;
  onUpdateAuthProfiles: (id: string, profiles: AuthProfilesInput) => Promise<void>;
  onGoToRun: (runId: string) => void;
}

export function TargetCatalog({
  targets,
  runs,
  loading,
  onOpenIngestModal,
  onDeleteTarget,
  onTriggerRun,
  onSelectTarget,
  onUpdateAuthProfiles,
  onGoToRun,
}: TargetCatalogProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<TargetSort>("recent");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [inspectingTarget, setInspectingTarget] = useState<TargetDetail | null>(null);
  const [authTarget, setAuthTarget] = useState<TargetDetail | null>(null);
  const [endpointSearch, setEndpointSearch] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("ALL");
  const [runningTargetId, setRunningTargetId] = useState<string | null>(null);
  const [deletingTargetId, setDeletingTargetId] = useState<string | null>(null);
  const [targetToDelete, setTargetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [dialogNotice, setDialogNotice] = useState<{
    title: string;
    description: string;
    variant: "success" | "danger" | "info";
  } | null>(null);

  const filteredTargets = targets.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.baseUrl.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visibleTargets = [...filteredTargets].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "risk":
        return (b.riskScore ?? 0) - (a.riskScore ?? 0);
      case "endpoints":
        return b.endpointsCount - a.endpointsCount;
      case "recent":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const totalEndpoints = targets.reduce((sum, t) => sum + t.endpointsCount, 0);
  const highRiskTargets = targets.filter((t) => (t.riskScore ?? 0) >= 50).length;

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      window.setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), 1500);
    } catch (err) {
      console.error("Failed to copy route:", err);
    }
  };

  useEffect(() => {
    if (!inspectingTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInspectingTarget(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inspectingTarget]);

  const handleInspect = async (targetId: string) => {
    try {
      const detail = await onSelectTarget(targetId);
      setInspectingTarget(detail);
      setEndpointSearch("");
      setSelectedMethod("ALL");
    } catch (err) {
      console.error("Failed to inspect target:", err);
    }
  };

  const handleOpenAuthProfiles = async (targetId: string) => {
    try {
      setAuthTarget(await onSelectTarget(targetId));
    } catch (err) {
      console.error("Failed to load auth profiles:", err);
    }
  };

  const handleSaveAuthProfiles = async (profiles: AuthProfilesInput) => {
    if (!authTarget) return;
    await onUpdateAuthProfiles(authTarget.id, profiles);
  };

  const handleRun = async (targetId: string, name: string) => {
    try {
      setRunningTargetId(targetId);
      await onTriggerRun(targetId);
      setDialogNotice({
        title: "Test run queued",
        description: `Started test run for "${name}". Results will appear in the Test Runs tab as tests complete.`,
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDialogNotice({
        title: "Could not queue test run",
        description: msg,
        variant: "danger",
      });
    } finally {
      setRunningTargetId(null);
    }
  };

  const promptDelete = (targetId: string, name: string) => {
    setTargetToDelete({ id: targetId, name });
  };

  const confirmDelete = async () => {
    if (!targetToDelete) return;
    try {
      setDeletingTargetId(targetToDelete.id);
      await onDeleteTarget(targetToDelete.id);
      if (inspectingTarget?.id === targetToDelete.id) {
        setInspectingTarget(null);
      }
      setTargetToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDialogNotice({
        title: "Could not remove target",
        description: msg,
        variant: "danger",
      });
      setTargetToDelete(null);
    } finally {
      setDeletingTargetId(null);
    }
  };

  // Helper for HTTP method badge colors
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

  // Helper for Risk Score pill
  const getRiskBadge = (score?: number) => {
    const s = score ?? 0;
    if (s >= 50) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <ShieldAlert className="w-3 h-3 text-rose-600" />
          <span>High risk ({s})</span>
        </span>
      );
    }
    if (s >= 20) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>Medium risk ({s})</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle className="w-3 h-3 text-emerald-600" />
        <span>Low risk ({s})</span>
      </span>
    );
  };

  // Helper for Auth Icon
  const getAuthIcon = (authType: string) => {
    const a = authType.toLowerCase();
    if (a.includes("bearer") || a.includes("oauth")) {
      return (
        <span title={`Auth: ${authType}`}>
          <Lock className="w-3 h-3 text-emerald-600" />
        </span>
      );
    }
    if (a.includes("api") || a.includes("key")) {
      return (
        <span title={`Auth: ${authType}`}>
          <Key className="w-3 h-3 text-amber-600" />
        </span>
      );
    }
    return (
      <span title="No authentication">
        <Unlock className="w-3 h-3 text-zinc-400" />
      </span>
    );
  };

  const methodCounts = (inspectingTarget?.endpoints || []).reduce<Record<string, number>>(
    (acc, ep) => {
      const m = ep.method.toUpperCase();
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Filtered endpoints inside inspection drawer
  const inspectedEndpoints = (inspectingTarget?.endpoints || []).filter((ep) => {
    const matchesMethod =
      selectedMethod === "ALL" || ep.method.toUpperCase() === selectedMethod;
    const matchesSearch =
      ep.path.toLowerCase().includes(endpointSearch.toLowerCase()) ||
      (ep.operationId && ep.operationId.toLowerCase().includes(endpointSearch.toLowerCase()));
    return matchesMethod && matchesSearch;
  });

  return (
    <>
      <div className="space-y-4">
        {/* Catalog Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-zinc-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-zinc-600" />
            <span className="text-xs font-semibold text-zinc-900 uppercase tracking-wider font-mono">
              Targets
            </span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-xs font-mono font-medium border border-zinc-200">
              {targets.length}
            </span>
          </div>
          {targets.length > 0 && (
            <span className="hidden md:inline text-[11px] font-mono text-zinc-500">
              {totalEndpoints} endpoints
              {highRiskTargets > 0 && (
                <span className="text-rose-600"> · {highRiskTargets} high risk</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter targets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors"
            />
          </div>

          <div className="relative shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <select
              aria-label="Sort targets"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TargetSort)}
              className="h-8 pl-8 pr-2 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 cursor-pointer"
            >
              <option value="recent">Recently added</option>
              <option value="name">Name (A-Z)</option>
              <option value="risk">Highest risk</option>
              <option value="endpoints">Most endpoints</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenIngestModal}
            className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-xs text-white font-medium transition-colors shadow-xs inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Target</span>
          </button>
        </div>
      </div>

      {/* Target Cards Grid */}
      {loading ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
          role="status"
          aria-label="Loading targets"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-zinc-200 p-4 shadow-xs space-y-3 animate-pulse"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-32 rounded bg-zinc-200" />
                  <div className="h-2.5 w-48 rounded bg-zinc-100" />
                </div>
                <div className="h-5 w-20 rounded bg-zinc-100" />
              </div>
              <div className="h-2.5 w-24 rounded bg-zinc-100" />
              <div className="flex gap-1.5 pt-2 border-t border-zinc-100">
                <div className="h-6 w-20 rounded bg-zinc-100" />
                <div className="h-6 w-24 rounded bg-zinc-100" />
                <div className="h-6 w-20 rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredTargets.length === 0 ? (
        <div className="p-10 text-center space-y-3 bg-white rounded-lg border border-zinc-200">
          <div className="inline-flex p-3 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-800">
              {searchTerm ? "No targets match your search" : "No targets added yet"}
            </p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Add an API by entering its OpenAPI URL or pasting the spec.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenIngestModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-medium shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Target</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visibleTargets.map((target) => (
            <div
              key={target.id}
              className="bg-white rounded-lg border border-zinc-200 p-4 shadow-xs hover:border-zinc-300 transition-all flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-1.5">
                      <span>{target.name}</span>
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-500 font-mono">
                      <span>{target.baseUrl}</span>
                    </div>
                  </div>
                  {getRiskBadge(target.riskScore)}
                </div>

                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1 text-zinc-600 font-medium">
                    <Layers className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{target.endpointsCount} endpoints</span>
                  </div>
                  <span className="text-zinc-300">·</span>
                  <span
                    className="text-[11px] text-zinc-500"
                    title={new Date(target.createdAt).toLocaleString()}
                  >
                    Added {formatRelativeTime(target.createdAt)}
                  </span>
                </div>

                {/* Recent runs for this target */}
                {(() => {
                  const targetRuns = runs
                    .filter((r) => r.targetId === target.id)
                    .slice(0, 3);
                  if (targetRuns.length === 0) return null;
                  const latestDone = targetRuns.find((r) => r.status === "completed");
                  const outcomeTotal = latestDone
                    ? latestDone.passedTests + latestDone.warningTests + latestDone.failedTests
                    : 0;
                  return (
                    <div className="mt-2 pt-2 border-t border-zinc-100 space-y-1">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-1">
                        Recent runs
                      </div>
                      {latestDone && outcomeTotal > 0 && (
                        <div
                          className="h-1.5 w-full rounded-full overflow-hidden bg-zinc-100 flex mb-1.5"
                          role="img"
                          aria-label={`Latest completed run: ${latestDone.passedTests} passed, ${latestDone.warningTests} warnings, ${latestDone.failedTests} failed`}
                        >
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${(latestDone.passedTests / outcomeTotal) * 100}%` }}
                          />
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${(latestDone.warningTests / outcomeTotal) * 100}%` }}
                          />
                          <div
                            className="h-full bg-rose-500"
                            style={{ width: `${(latestDone.failedTests / outcomeTotal) * 100}%` }}
                          />
                        </div>
                      )}
                      {targetRuns.map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => onGoToRun(run.id)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-zinc-50 transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {run.status === "completed" && run.failedTests === 0 && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                            )}
                            {run.status === "completed" && run.failedTests > 0 && (
                              <XCircle className="w-3 h-3 text-rose-500 shrink-0" />
                            )}
                            {(run.status === "running" || run.status === "queued") && (
                              <Clock className="w-3 h-3 text-amber-500 shrink-0 animate-pulse" />
                            )}
                            <span className="text-[11px] font-mono text-zinc-500 truncate">
                              {run.id.slice(0, 8)}
                            </span>
                            {run.status === "completed" && (
                              <span className="text-[10px] font-mono text-zinc-400">
                                {run.failedTests}F / {run.warningTests}W / {run.passedTests}P
                              </span>
                            )}
                            {run.status !== "completed" && (
                              <span className="text-[10px] font-mono text-zinc-400 capitalize">
                                {run.status}
                              </span>
                            )}
                          </div>
                          <ArrowRight className="w-3 h-3 text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleInspect(target.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-zinc-500" />
                    <span>View routes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenAuthProfiles(target.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-colors"
                  >
                    <ShieldCheck
                      className={`w-3 h-3 ${target.hasAuthProfiles ? "text-emerald-600" : "text-zinc-500"}`}
                    />
                    <span>{target.hasAuthProfiles ? "Auth profiles" : "Set up auth"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={runningTargetId === target.id}
                    onClick={() => handleRun(target.id, target.name)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                    <span>{runningTargetId === target.id ? "Starting..." : "Run tests"}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={deletingTargetId === target.id}
                  onClick={() => promptDelete(target.id, target.name)}
                  className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete target"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      <AuthProfilesModal
        isOpen={authTarget !== null}
        targetName={authTarget?.name ?? ""}
        saved={authTarget?.authProfiles ?? {}}
        onClose={() => setAuthTarget(null)}
        onSubmit={handleSaveAuthProfiles}
      />

      {/* Discovered Endpoints Inspection Drawer / Modal */}
      {inspectingTarget && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
            onClick={() => setInspectingTarget(null)}
          >
          <div
            className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-zinc-200 flex flex-col cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-zinc-200 bg-zinc-50/75 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    {inspectingTarget.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-200/70 text-zinc-700 font-medium">
                    {inspectingTarget.endpoints.length} routes
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-0.5">
                  {inspectingTarget.baseUrl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingTarget(null)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter bar */}
            <div className="p-3 border-b border-zinc-200 bg-white flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter routes..."
                  value={endpointSearch}
                  onChange={(e) => setEndpointSearch(e.target.value)}
                  className="w-full h-7 pl-8 pr-2.5 rounded bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-1 text-[11px] font-mono">
                {["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMethod(m)}
                    className={`px-2 py-1 rounded transition-colors ${
                      selectedMethod === m
                        ? "bg-zinc-800 text-white font-medium"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {m}
                    <span className="ml-1 opacity-60">
                      {m === "ALL" ? inspectingTarget.endpoints.length : methodCounts[m] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Endpoints List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-zinc-100">
              {inspectedEndpoints.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No routes match this filter.
                </div>
              ) : (
                inspectedEndpoints.map((ep: EndpointSummary) => (
                  <div key={ep.id} className="pt-2 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${getMethodBadge(
                            ep.method
                          )}`}
                        >
                          {ep.method.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono text-zinc-900 font-medium truncate">
                          {ep.path}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyPath(ep.path)}
                          aria-label={`Copy path ${ep.path}`}
                          title="Copy path"
                          className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
                        >
                          {copiedPath === ep.path ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                          {getAuthIcon(ep.authType)}
                          <span>{ep.authType}</span>
                        </div>
                        {ep.riskScore > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                              ep.riskScore >= 50
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : ep.riskScore >= 20
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                            title="Endpoint risk score"
                          >
                            risk {ep.riskScore}
                          </span>
                        )}
                        {ep.parameters && ep.parameters.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-600 border border-zinc-200">
                            {ep.parameters.length} params
                          </span>
                        )}
                      </div>
                    </div>

                    {ep.operationId && (
                      <div className="text-[11px] text-zinc-400 font-mono mt-1 pl-12">
                        operationId: <span className="text-zinc-600">{ep.operationId}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Showing {inspectedEndpoints.length} of {inspectingTarget.endpoints.length} routes
              </span>
              <button
                type="button"
                onClick={() => handleRun(inspectingTarget.id, inspectingTarget.name)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-medium shadow-xs transition-colors"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>Run all tests</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog for Removal */}
      <Dialog
        isOpen={Boolean(targetToDelete)}
        title="Remove Target"
        description={
          targetToDelete
            ? `Are you sure you want to remove "${targetToDelete.name}" and all associated endpoints? This action cannot be undone.`
            : ""
        }
        confirmText="Remove Target"
        cancelText="Cancel"
        variant="danger"
        loading={deletingTargetId !== null}
        onConfirm={confirmDelete}
        onCancel={() => setTargetToDelete(null)}
      />

      {/* Info / Feedback Dialog */}
      <Dialog
        isOpen={Boolean(dialogNotice)}
        title={dialogNotice?.title ?? ""}
        description={dialogNotice?.description ?? ""}
        variant={dialogNotice?.variant ?? "info"}
        confirmText="OK"
        onConfirm={() => setDialogNotice(null)}
      />
    </>
  );
}
