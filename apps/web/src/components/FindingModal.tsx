import React, { useEffect } from "react";
import {
  X,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Code,
  ArrowRight,
} from "lucide-react";
import type { TestFinding } from "../types.js";

export interface FindingModalProps {
  finding: TestFinding | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FindingModal({
  finding,
  isOpen,
  onClose,
}: FindingModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !finding) return null;

  const method = finding.detail.requestSent?.method || "GET";
  const url = finding.detail.requestSent?.url || `/endpoint/${finding.endpointId}`;
  const responseStatus = finding.detail.responseReceived?.status;

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "critical":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "high":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "low":
        return "bg-sky-50 text-sky-700 border-sky-200";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "fail":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>FAIL</span>
          </span>
        );
      case "warn":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>WARN</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>PASS</span>
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-150 m-0"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50/75 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            {getStatusBadge(finding.status)}
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase font-mono border ${getSeverityBadge(
                finding.severity
              )}`}
            >
              {finding.severity}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 text-zinc-600 border border-zinc-200">
              {finding.category}
            </span>
            <h3 className="text-sm font-bold text-zinc-900 font-mono">
              {finding.testName}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Target Endpoint & Latency */}
          <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 flex items-center justify-between gap-3 font-mono">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-zinc-200 text-zinc-800">
                {method}
              </span>
              <span className="text-zinc-900 font-medium truncate">{url}</span>
            </div>
            {finding.latencyMs !== undefined && finding.latencyMs !== null && (
              <span className="text-zinc-500 text-[11px] shrink-0">
                Latency: <span className="text-zinc-900 font-bold">{finding.latencyMs}ms</span>
              </span>
            )}
          </div>

          {/* Finding Evidence Alert */}
          <div
            className={`p-3.5 rounded-lg border text-xs space-y-1 ${
              finding.status === "fail"
                ? "bg-rose-50/60 border-rose-200 text-rose-950"
                : finding.status === "warn"
                ? "bg-amber-50/60 border-amber-200 text-amber-950"
                : "bg-emerald-50/60 border-emerald-200 text-emerald-950"
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Evidence</span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed pl-5">
              {finding.detail.evidence}
            </p>
          </div>

          {/* Remediation Guidance */}
          {finding.detail.remediation && (
            <div className="p-3.5 rounded-lg bg-emerald-50/40 border border-emerald-200/80 text-emerald-950 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-800 flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>Suggested fix</span>
              </div>
              <p className="text-zinc-700 leading-relaxed text-xs pl-5">
                {finding.detail.remediation}
              </p>
            </div>
          )}

          {/* Request Sent Details */}
          {finding.detail.requestSent && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-zinc-400" />
                <span>HTTP request</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-[11px] space-y-2 overflow-x-auto shadow-inner">
                <div>
                  <span className="text-emerald-400 font-bold">
                    {finding.detail.requestSent.method}
                  </span>{" "}
                  <span className="text-zinc-300">{finding.detail.requestSent.url}</span>
                </div>
                {finding.detail.requestSent.headers && (
                  <div className="text-zinc-400 border-t border-zinc-800 pt-1.5 space-y-0.5">
                    {Object.entries(finding.detail.requestSent.headers).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-zinc-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                )}
                {Boolean(finding.detail.requestSent.body) && (
                  <div className="border-t border-zinc-800 pt-1.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                      Request body
                    </div>
                    <pre className="text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                      {typeof finding.detail.requestSent.body === "string"
                        ? finding.detail.requestSent.body
                        : JSON.stringify(finding.detail.requestSent.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Response Received Details */}
          {finding.detail.responseReceived && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-zinc-400" />
                <span>HTTP response</span>
                {responseStatus && (
                  <span
                    className={`ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      responseStatus >= 500
                        ? "bg-rose-100 text-rose-800"
                        : responseStatus >= 400
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    HTTP {responseStatus}
                  </span>
                )}
              </div>
              <div className="p-3 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-[11px] space-y-2 overflow-x-auto shadow-inner">
                {finding.detail.responseReceived.headers && (
                  <div className="text-zinc-400 space-y-0.5">
                    {Object.entries(finding.detail.responseReceived.headers).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-zinc-500">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                )}
                {finding.detail.responseReceived.body !== undefined && (
                  <div className="border-t border-zinc-800 pt-1.5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                      Response Body
                    </div>
                    <pre className="text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                      {typeof finding.detail.responseReceived.body === "string"
                        ? finding.detail.responseReceived.body
                        : JSON.stringify(finding.detail.responseReceived.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
          <span className="text-[11px] font-mono text-zinc-400">
            ID: {finding.id}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
