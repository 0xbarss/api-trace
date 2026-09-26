import React, { useState } from "react";
import {
  Server,
  Radio,
  Plus,
  Search,
  Activity,
  CheckCircle2,
  FileCode2,
  ArrowLeft,
} from "lucide-react";
import { LandingPage } from "./LandingPage.js";

export function App(): React.ReactElement {
  const [currentView, setCurrentView] = useState<"landing" | "app">("landing");
  const [activeTab, setActiveTab] = useState<"targets" | "runs" | "findings">("targets");
  const [specUrl, setSpecUrl] = useState("");
  const [targetName, setTargetName] = useState("");

  if (currentView === "landing") {
    return <LandingPage onSwitchToApp={() => setCurrentView("app")} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans selection:bg-zinc-200">
      {/* Top Application Bar */}
      <header className="h-14 border-b border-zinc-200 bg-white px-4 sm:px-6 flex items-center justify-between select-none shadow-xs">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setCurrentView("landing")}
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
              onClick={() => setActiveTab("targets")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === "targets"
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Targets
            </button>
            <button
              onClick={() => setActiveTab("runs")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === "runs"
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              Test Runs
            </button>
            <button
              onClick={() => setActiveTab("findings")}
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

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-50 border border-zinc-200 text-zinc-600 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>ws://127.0.0.1:3001</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Ingestion & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
              Target Inventory
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Connected APIs, discovered routes, and test suites.
            </p>
          </div>
        </div>

        {/* Quick Ingest Bar */}
        <section className="bg-white border border-zinc-200 rounded-lg p-4 shadow-xs">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2.5 flex items-center justify-between">
            <span>Add OpenAPI Target</span>
            <span className="text-zinc-400 font-normal">POST /api/targets</span>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="text"
              placeholder="Target Name"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="h-8 px-3 rounded bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white sm:w-64 font-mono transition-colors"
            />
            <input
              type="text"
              placeholder="OpenAPI Specification URL"
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
              className="flex-1 h-8 px-3 rounded bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white font-mono transition-colors"
            />
            <button
              type="submit"
              className="h-8 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-xs text-white font-medium transition-colors shadow-xs whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Target</span>
            </button>
          </form>
        </section>

        {/* Main Grid / Table */}
        <div className="border border-zinc-200 rounded-lg bg-white shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50/75 border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-medium text-zinc-800">Registered Targets</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-200/80 text-zinc-700 text-[10px] font-mono">
                0
              </span>
            </div>

            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Filter endpoints..."
                className="h-7 pl-7 pr-2.5 rounded bg-white border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 font-mono w-44"
              />
            </div>
          </div>

          {/* Table / Empty State */}
          <div className="p-8 text-center space-y-3">
            <div className="inline-flex p-2 rounded bg-zinc-100 border border-zinc-200 text-zinc-500">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-800">No targets added yet</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Enter an OpenAPI specification URL above to discover endpoints and generate tests.
              </p>
            </div>

            <div className="pt-2">
              <code className="inline-block text-[11px] font-mono text-zinc-700 bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded select-all">
                curl -s -X POST http://localhost:3001/api/targets -H &apos;Content-Type: application/json&apos;
              </code>
            </div>
          </div>
        </div>

        {/* System Telemetry & Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Fastify Gateway</span>
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">http://127.0.0.1:3001</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">REST &amp; OpenAPI service</div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Event Broker</span>
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">Redis 7 PubSub</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Live test progress channel</div>
          </div>

          <div className="border border-zinc-200 bg-white rounded-lg p-3.5 shadow-xs text-xs">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Probe Suite</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-zinc-900 font-medium">Security &amp; speed suite</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Automated HTTP probes</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
