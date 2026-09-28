import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  Activity,
  CheckCircle2,
  ArrowLeft,
  Server,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import { LandingPage } from "./LandingPage.js";
import { TargetCatalog } from "./components/TargetCatalog.js";
import { TargetIngestionModal } from "./components/TargetIngestionModal.js";
import { RunVisualizer } from "./components/RunVisualizer.js";
import { EventTicker } from "./components/EventTicker.js";
import { FindingsView } from "./components/FindingsView.js";
import { FindingModal } from "./components/FindingModal.js";
import { apiClient } from "./api/client.js";
import type {
  TargetSummary,
  TargetDetail,
  CreateTargetInput,
  AuthProfilesInput,
  RunSummary,
  WebSocketRunEvent,
  TestFinding,
} from "./types.js";

const getInitialView = (): "landing" | "app" => {
  if (typeof window !== "undefined") {
    if (window.location.hash.startsWith("#console") || window.location.hash.startsWith("#app")) {
      return "app";
    }
    const saved = localStorage.getItem("apitrace_view");
    if (saved === "app") {
      return "app";
    }
  }
  return "landing";
};

const getInitialTab = (): "targets" | "runs" | "findings" => {
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    if (hash.includes("runs")) return "runs";
    if (hash.includes("findings")) return "findings";
    if (hash.includes("targets")) return "targets";
    const saved = localStorage.getItem("apitrace_tab");
    if (saved === "targets" || saved === "runs" || saved === "findings") {
      return saved;
    }
  }
  return "targets";
};

export function App(): React.ReactElement {
  const [currentView, setCurrentView] = useState<"landing" | "app">(getInitialView);
  const [activeTab, setActiveTab] = useState<"targets" | "runs" | "findings">(getInitialTab);
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<WebSocketRunEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<TestFinding | null>(null);

  const switchView = (view: "landing" | "app") => {
    setCurrentView(view);
    if (typeof window !== "undefined") {
      localStorage.setItem("apitrace_view", view);
      if (view === "app") {
        window.location.hash = `#console/${activeTab}`;
      } else {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  };

  const switchTab = (tab: "targets" | "runs" | "findings") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("apitrace_tab", tab);
      if (currentView === "app") {
        window.location.hash = `#console/${tab}`;
      }
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#console") || hash.startsWith("#app")) {
        setCurrentView("app");
        if (hash.includes("runs")) setActiveTab("runs");
        else if (hash.includes("findings")) setActiveTab("findings");
        else if (hash.includes("targets")) setActiveTab("targets");
      } else {
        const saved = localStorage.getItem("apitrace_view");
        if (saved !== "app") {
          setCurrentView("landing");
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const fetchTargets = useCallback(async () => {
    try {
      setLoadingTargets(true);
      const data = await apiClient.listTargets();
      setTargets(data);
      setIsLiveConnected(apiClient.getOnlineStatus() ?? false);
    } catch (err) {
      console.error("Failed to load targets:", err);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      setLoadingRuns(true);
      const list = await apiClient.listRuns();
      setRuns(list);
      if (list.length > 0) {
        setActiveRunId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0].id));
      }
    } catch (err) {
      console.error("Failed to load runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === "app") {
      void fetchTargets();
      void fetchRuns();
    }
  }, [currentView, fetchTargets, fetchRuns]);

  useEffect(() => {
    if (!activeRunId || currentView !== "app" || activeTab !== "runs" || !isStreaming) {
      return;
    }

    void apiClient.getRunResults(activeRunId).then((findings) => {
      if (findings.length > 0) {
        setRunEvents(
          findings.map((f) => ({
            type: "TEST_COMPLETED",
            runId: activeRunId,
            endpointId: f.endpointId,
            result: f,
            timestamp: f.createdAt,
          }))
        );
      }
    });

    const unsubscribe = apiClient.subscribeRunStream(
      activeRunId,
      (event) => {
        if (event.type === "TEST_COMPLETED" && event.result) {
          setRunEvents((prev) => [event, ...prev]);

          setRuns((prev) =>
            prev.map((r) => {
              if (r.id !== activeRunId) return r;
              const status = event.result!.status;
              return {
                ...r,
                completedTests: event.completedTests ?? r.completedTests + 1,
                totalTests: event.totalTests ?? r.totalTests,
                passedTests: status === "pass" ? r.passedTests + 1 : r.passedTests,
                warningTests: status === "warn" ? r.warningTests + 1 : r.warningTests,
                failedTests: status === "fail" ? r.failedTests + 1 : r.failedTests,
              };
            })
          );
        } else if (event.type === "RUN_COMPLETED") {
          setRuns((prev) =>
            prev.map((r) =>
              r.id === activeRunId
                ? { ...r, status: "completed", finishedAt: event.timestamp || new Date().toISOString() }
                : r
            )
          );
        }
      },
      (err) => {
        console.warn("WebSocket event error:", err);
      }
    );

    return () => unsubscribe();
  }, [activeRunId, currentView, activeTab, isStreaming]);

  const handleCreateTarget = async (input: CreateTargetInput) => {
    await apiClient.createTarget(input);
    await fetchTargets();
  };

  const handleDeleteTarget = async (id: string) => {
    await apiClient.deleteTarget(id);
    await fetchTargets();
    await fetchRuns();
  };

  const handleTriggerRun = async (targetId: string) => {
    const res = await apiClient.triggerRun(targetId);
    await fetchRuns();
    setActiveRunId(res.runId);
    setRunEvents([]);
    switchTab("runs");
  };

  const handleUpdateAuthProfiles = async (id: string, profiles: AuthProfilesInput) => {
    await apiClient.updateAuthProfiles(id, profiles);
    await fetchTargets();
  };

  const handleSelectTarget = async (id: string): Promise<TargetDetail> => {
    return await apiClient.getTarget(id);
  };

  const activeRun = runs.find((r) => r.id === activeRunId) || runs[0] || null;
  const activeTarget = targets.find((t) => t.id === activeRun?.targetId);

  if (currentView === "landing") {
    return <LandingPage onSwitchToApp={() => switchView("app")} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-zinc-200">
      {/* Top Application Bar */}
      <header className="h-14 border-b border-zinc-200 bg-white px-4 sm:px-6 flex items-center justify-between select-none shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => switchView("landing")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <div className="flex items-center gap-2 border-l border-zinc-200 pl-3">
            <span className="text-xl font-black tracking-tight text-zinc-950">
              API Trace
            </span>
            <span className="text-zinc-400 text-sm">/</span>
            <span className="text-xs text-zinc-500 font-mono">console</span>
          </div>

          <nav className="flex items-center gap-1 border-l border-zinc-200 pl-4">
            <button
              onClick={() => switchTab("targets")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === "targets"
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Targets
            </button>
            <button
              onClick={() => switchTab("runs")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === "runs"
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Test Runs
            </button>
            <button
              onClick={() => switchTab("findings")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === "findings"
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Findings
            </button>
          </nav>
        </div>

        {isLiveConnected && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-600 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ws://127.0.0.1:3001 (Live)</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
        {activeTab === "targets" && (
          <TargetCatalog
            targets={targets}
            loading={loadingTargets}
            onOpenIngestModal={() => setIsIngestModalOpen(true)}
            onDeleteTarget={handleDeleteTarget}
            onTriggerRun={handleTriggerRun}
            onSelectTarget={handleSelectTarget}
            onUpdateAuthProfiles={handleUpdateAuthProfiles}
          />
        )}

        {activeTab === "runs" && (
          <div className="space-y-6">
            <RunVisualizer
              runs={runs}
              activeRun={activeRun}
              loading={loadingRuns}
              onSelectRun={(id) => {
                setActiveRunId(id);
                setRunEvents([]);
              }}
              onRefresh={fetchRuns}
              onTriggerNewRun={() => {
                if (targets.length > 0) {
                  void handleTriggerRun(targets[0].id);
                } else {
                  setIsIngestModalOpen(true);
                }
              }}
              targetName={activeTarget?.name}
            />

            <EventTicker
              runId={activeRun?.id || null}
              events={runEvents}
              streaming={isStreaming}
              onToggleStreaming={() => setIsStreaming((prev) => !prev)}
              onClearEvents={() => setRunEvents([])}
              onSelectFinding={(f) => setSelectedFinding(f)}
            />
          </div>
        )}

        {activeTab === "findings" && (
          <FindingsView
            runs={runs}
            activeRunId={activeRunId}
            onSelectRun={(id) => setActiveRunId(id)}
            targets={targets}
          />
        )}

        {/* System Telemetry & Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Backend API</span>
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">http://127.0.0.1:3001</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">REST and OpenAPI service</div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Event stream</span>
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">Redis PubSub</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Live test events</div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Test engine</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">Security and latency tests</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Automated HTTP tests</div>
          </div>
        </div>
      </main>

      {/* Target Ingestion Modal */}
      <TargetIngestionModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onSubmit={handleCreateTarget}
      />

      {/* Finding Detail Modal */}
      <FindingModal
        finding={selectedFinding}
        isOpen={Boolean(selectedFinding)}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}

export default App;
