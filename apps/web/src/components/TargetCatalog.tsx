import React, { useState } from "react";
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
} from "lucide-react";
import type { TargetSummary, TargetDetail, EndpointSummary } from "../types.js";
import { Dialog } from "./Dialog.js";

interface TargetCatalogProps {
  targets: TargetSummary[];
  loading: boolean;
  onOpenIngestModal: () => void;
  onDeleteTarget: (id: string) => Promise<void>;
  onTriggerRun: (targetId: string) => Promise<void>;
  onSelectTarget: (id: string) => Promise<TargetDetail>;
}

export function TargetCatalog({
  targets,
  loading,
  onOpenIngestModal,
  onDeleteTarget,
  onTriggerRun,
  onSelectTarget,
}: TargetCatalogProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectingTarget, setInspectingTarget] = useState<TargetDetail | null>(null);
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

  const handleRun = async (targetId: string, name: string) => {
    try {
      setRunningTargetId(targetId);
      await onTriggerRun(targetId);
      setDialogNotice({
        title: "Test Run Queued",
        description: `Dispatched test suite execution for "${name}". Test jobs are currently being processed by the worker queue.`,
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDialogNotice({
        title: "Failed to Queue Test Run",
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
        title: "Failed to Remove Target",
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
        <div className="p-12 text-center text-xs text-zinc-500 bg-white rounded-lg border border-zinc-200">
          Loading targets...
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
          {filteredTargets.map((target) => (
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
                </div>
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

      {/* Discovered Endpoints Inspection Drawer / Modal */}
      {inspectingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-zinc-950/30 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-zinc-200 flex flex-col">
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
                {["ALL", "GET", "POST", "PUT", "DELETE"].map((m) => (
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
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                          {getAuthIcon(ep.authType)}
                          <span>{ep.authType}</span>
                        </div>
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
        </div>
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
    </div>
  );
}
