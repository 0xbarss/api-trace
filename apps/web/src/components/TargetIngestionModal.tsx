import React, { useState } from "react";
import { X, AlertCircle, Loader2, Link2, Code2 } from "lucide-react";
import type { CreateTargetInput } from "../types.js";

interface TargetIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTargetInput) => Promise<void>;
}

function formatModalError(raw: string): string {
  if (/getaddrinfo ENOTFOUND/i.test(raw)) {
    const match = raw.match(/getaddrinfo ENOTFOUND\s+([^\s:]+)/i);
    const host = match ? match[1] : "host";
    return `Could not reach specification URL: host "${host}" could not be resolved. Please verify the domain and route.`;
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return "Could not connect to specification host: connection refused. Ensure the service is running and accessible.";
  }
  if (/ETIMEDOUT/i.test(raw)) {
    return "Connection timed out while fetching specification. Please verify the URL and network availability.";
  }
  if (/Failed to parse OpenAPI specification:\s*Error downloading/i.test(raw)) {
    return raw.replace(/Failed to parse OpenAPI specification:\s*/i, "");
  }
  return raw;
}

export function TargetIngestionModal({
  isOpen,
  onClose,
  onSubmit,
}: TargetIngestionModalProps): React.ReactElement | null {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [specMode, setSpecMode] = useState<"url" | "raw">("url");
  const [specUrl, setSpecUrl] = useState("");
  const [rawSpec, setRawSpec] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSpecUrlChange = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsed = new URL(trimmed);
        if (!baseUrl.trim()) {
          setBaseUrl(parsed.origin);
        }
        const route = (parsed.pathname || "/") + (parsed.search || "");
        setSpecUrl(route);
        return;
      } catch {
        // Still typing full url
      }
    }
    setSpecUrl(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedBaseUrl = baseUrl.trim();
    let specSource = specMode === "url" ? specUrl.trim() : rawSpec.trim();

    if (!trimmedName) {
      setError("Enter a service name.");
      return;
    }

    if (!trimmedBaseUrl.startsWith("http://") && !trimmedBaseUrl.startsWith("https://")) {
      setError("Base URL must start with http:// or https://");
      return;
    }

    if (specMode === "url") {
      if (!specSource) {
        setError("Enter a specification route or full URL.");
        return;
      }
      if (!specSource.startsWith("http://") && !specSource.startsWith("https://")) {
        const cleanBase = trimmedBaseUrl.replace(/\/+$/, "");
        const cleanRoute = specSource.replace(/^\/+/, "");
        specSource = `${cleanBase}/${cleanRoute}`;
      }
    } else if (!specSource) {
      setError("Paste your OpenAPI JSON or YAML spec.");
      return;
    }

    try {
      setLoading(true);
      await onSubmit({
        name: trimmedName,
        baseUrl: trimmedBaseUrl,
        specSource,
      });
      setName("");
      setBaseUrl("");
      setSpecUrl("");
      setRawSpec("");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(formatModalError(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-zinc-200 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
              Add API target
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Import an OpenAPI or Swagger spec to map endpoints and run tests.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Service Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700 block">
              Service name
            </label>
            <input
              type="text"
              placeholder="Payment service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
            />
          </div>

          {/* Base URL */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700 block">
              Base URL
            </label>
            <input
              type="text"
              placeholder="http://localhost:3000 or https://api.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full h-8 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
            />
            <p className="text-[11px] text-zinc-400">
              The address where your API is running.
            </p>
          </div>

          {/* Spec Ingestion Mode Switcher */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700">
                {specMode === "url" ? "Specification route" : "Specification text"}
              </label>
              <div className="inline-flex rounded-md p-0.5 bg-zinc-100 border border-zinc-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSpecMode("url")}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    specMode === "url"
                      ? "bg-white text-zinc-900 font-medium shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  <span>Route</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSpecMode("raw")}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    specMode === "raw"
                      ? "bg-white text-zinc-900 font-medium shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span>Paste text</span>
                </button>
              </div>
            </div>

            {specMode === "url" ? (
              <div className="flex rounded-md border border-zinc-200 bg-zinc-50 overflow-hidden focus-within:border-emerald-500 focus-within:bg-white transition-colors">
                {baseUrl.trim() &&
                  !specUrl.startsWith("http://") &&
                  !specUrl.startsWith("https://") && (
                    <span className="inline-flex items-center px-2.5 bg-zinc-100 text-zinc-500 font-mono text-xs border-r border-zinc-200 select-none shrink-0 truncate max-w-[200px]">
                      {baseUrl.trim().replace(/\/+$/, "")}
                    </span>
                  )}
                <input
                  type="text"
                  placeholder="/api-docs/swagger.json or /openapi.json"
                  value={specUrl}
                  onChange={(e) => handleSpecUrlChange(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text").trim();
                    if (pasted.startsWith("http://") || pasted.startsWith("https://")) {
                      try {
                        const parsed = new URL(pasted);
                        e.preventDefault();
                        if (!baseUrl.trim()) {
                          setBaseUrl(parsed.origin);
                        }
                        const route = (parsed.pathname || "/") + (parsed.search || "");
                        setSpecUrl(route);
                      } catch {
                        // ignore malformed URL
                      }
                    }
                  }}
                  onBlur={() => {
                    const trimmed = specUrl.trim();
                    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                      try {
                        const parsed = new URL(trimmed);
                        if (!baseUrl.trim()) {
                          setBaseUrl(parsed.origin);
                        }
                        const route = (parsed.pathname || "/") + (parsed.search || "");
                        setSpecUrl(route);
                      } catch {
                        // ignore malformed URL
                      }
                    }
                  }}
                  className="flex-1 h-8 px-3 bg-transparent text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </div>
            ) : (
              <textarea
                rows={5}
                placeholder="Paste JSON or YAML here..."
                value={rawSpec}
                onChange={(e) => setRawSpec(e.target.value)}
                className="w-full p-2.5 rounded-md bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors resize-none"
              />
            )}
            {specMode === "url" ? (
              <p className="text-[11px] text-zinc-400">
                The path to your OpenAPI or Swagger schema.
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400">
                JSON or YAML OpenAPI specification content.
              </p>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-xs font-medium text-white transition-colors shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading spec...</span>
                </>
              ) : (
                <span>Add target</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
