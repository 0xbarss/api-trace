import React, { useState, useEffect } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  Activity,
  Terminal,
  ChevronDown,
} from "lucide-react";
import type { RunSummary } from "../types.js";
import { computeRunRate, formatDuration } from "../lib/run-stats.js";

export interface RunVisualizerProps {
  runs: RunSummary[];
  activeRun: RunSummary | null;
  loading: boolean;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
  onTriggerNewRun?: () => void;
  targetName?: string;
}

export function RunVisualizer({
  runs,
  activeRun,
  loading,
  onSelectRun,
  onRefresh,
  onTriggerNewRun,
  targetName,
}: RunVisualizerProps): React.ReactElement {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Elapsed timer tracking
  useEffect(() => {
    if (!activeRun) {
      setElapsedSeconds(0);
      return;
    }

    if (activeRun.startedAt && activeRun.finishedAt) {
      const start = new Date(activeRun.startedAt).getTime();
      const end = new Date(activeRun.finishedAt).getTime();
      setElapsedSeconds(Math.max(0, Math.round((end - start) / 1000)));
      return;
    }

    if (activeRun.status === "running" && activeRun.startedAt) {
      const start = new Date(activeRun.startedAt).getTime();
      const calcElapsed = () => {
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.round((now - start) / 1000)));
      };
      calcElapsed();
      const timer = setInterval(calcElapsed, 1000);
      return () => clearInterval(timer);
    }

    setElapsedSeconds(0);
  }, [activeRun]);

  const total = activeRun?.totalTests ?? 0;
  const completed = activeRun?.completedTests ?? 0;
  const passed = activeRun?.passedTests ?? 0;
  const warnings = activeRun?.warningTests ?? 0;
  const failed = activeRun?.failedTests ?? 0;

  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const segmentWidth = (count: number): number =>
    total > 0 ? Math.min(100, (count / total) * 100) : 0;
  const shareOfCompleted = (count: number): number =>
    completed > 0 ? Math.round((count / completed) * 100) : 0;
  const isActive = activeRun?.status === "running";
  const { perSecond, etaSeconds } = computeRunRate(completed, total, elapsedSeconds);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Executing</span>
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Queued</span>
          </span>
        );
    }
  };

  if (!activeRun && runs.length === 0) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-3 shadow-xs">
        <div className="w-10 h-10 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center mx-auto text-zinc-400">
          <Terminal className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-zinc-900">
            No test runs yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Start a test run from the Targets tab to watch live progress and view findings.
          </p>
        </div>
        {onTriggerNewRun && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onTriggerNewRun}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start test run</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run Selector & Meta Card */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Run Switcher Dropdown */}
            <div className="relative">
              <select
                aria-label="Select test run"
                value={activeRun?.id || ""}
                onChange={(e) => onSelectRun(e.target.value)}
                className="appearance-none h-8 pl-3 pr-8 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-mono font-semibold text-zinc-900 focus:outline-none focus:border-zinc-400 cursor-pointer shadow-2xs"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run {r.id.slice(0, 8)} • {r.status}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {getStatusBadge(activeRun?.status)}

            {targetName && (
              <span className="text-xs text-zinc-500 hidden sm:inline">
                for <span className="text-zinc-900 font-medium">{targetName}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* Elapsed Timer */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 font-mono text-zinc-600">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Runtime: {formatDuration(elapsedSeconds)}</span>
            </div>

            {isActive && perSecond !== null && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 font-mono text-zinc-600">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {perSecond.toFixed(1)} tests/s
                  {etaSeconds !== null && ` · ~${formatDuration(etaSeconds)} left`}
                </span>
              </div>
            )}

            {/* Refresh Action */}
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 transition-colors disabled:opacity-50"
              title="Refresh run status"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Live Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-700">Progress</span>
            <span className="font-mono text-zinc-900 font-semibold">
              {completed} / {total} tests ({percentage}%)
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Test run progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
            className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/80 flex"
          >
            <div
              className="h-full bg-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${segmentWidth(passed)}%` }}
              title={`${passed} passed`}
            />
            <div
              className="h-full bg-amber-400 transition-all duration-300 ease-out"
              style={{ width: `${segmentWidth(warnings)}%` }}
              title={`${warnings} warnings`}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-300 ease-out"
              style={{ width: `${segmentWidth(failed)}%` }}
              title={`${failed} failed`}
            />
          </div>
        </div>
      </div>

      {/* 4-Stat Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Tests */}
        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
            <span>Total tests</span>
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 mt-1">
            {total}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">Planned tests</div>
        </div>

        {/* Passed */}
        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs">
          <div className="text-[11px] font-mono text-emerald-700 uppercase tracking-wider flex items-center justify-between">
            <span>Passed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            {passed}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{shareOfCompleted(passed)}% of completed</div>
        </div>

        {/* Warnings */}
        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs">
          <div className="text-[11px] font-mono text-amber-700 uppercase tracking-wider flex items-center justify-between">
            <span>Warnings</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
            {warnings}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{shareOfCompleted(warnings)}% of completed</div>
        </div>

        {/* Failed */}
        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs">
          <div className="text-[11px] font-mono text-rose-700 uppercase tracking-wider flex items-center justify-between">
            <span>Failed</span>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700 mt-1">
            {failed}
          </div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{shareOfCompleted(failed)}% of completed</div>
        </div>
      </div>
    </div>
  );
}
