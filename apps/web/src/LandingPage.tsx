import React, { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Workflow,
} from "lucide-react";

interface LandingPageProps {
  onSwitchToApp: () => void;
}

interface DemoResult {
  endpoint: string;
  method: "GET" | "POST" | "DELETE";
  check: string;
  status: "pass" | "warn" | "fail";
  latency: string;
  detail: string;
}

const SAMPLE_RESULTS: DemoResult[] = [
  {
    endpoint: "/api/v1/products",
    method: "GET",
    check: "Contract Match",
    status: "pass",
    latency: "24ms",
    detail: "Response payload matches schema specification",
  },
  {
    endpoint: "/api/v1/auth/login",
    method: "POST",
    check: "Data Privacy",
    status: "pass",
    latency: "38ms",
    detail: "Rejected invalid input safely without leaking sensitive error traces",
  },
  {
    endpoint: "/api/v1/orders/9842",
    method: "GET",
    check: "Access Control",
    status: "fail",
    latency: "41ms",
    detail: "Unauthorized data was accessible without tenant permissions",
  },
  {
    endpoint: "/api/v1/coupons/apply",
    method: "POST",
    check: "Traffic Throttling",
    status: "warn",
    latency: "19ms",
    detail: "High-frequency requests accepted without protective rate limits",
  },
];

export function LandingPage({ onSwitchToApp }: LandingPageProps): React.ReactElement {
  const [isRunningScan, setIsRunningScan] = useState(false);
  const [completedScan, setCompletedScan] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(0);

  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const clearAllTimeouts = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  const runInteractiveDemo = () => {
    if (isRunningScan) return;
    clearAllTimeouts();
    setIsRunningScan(true);
    setCompletedScan(false);
    setVisibleCount(0);

    const t1 = setTimeout(() => {
      setVisibleCount(1);
    }, 350);

    const t2 = setTimeout(() => {
      setVisibleCount(2);
    }, 850);

    const t3 = setTimeout(() => {
      setVisibleCount(3);
    }, 1400);

    const t4 = setTimeout(() => {
      setVisibleCount(4);
      setIsRunningScan(false);
      setCompletedScan(true);
    }, 1950);

    timeoutsRef.current = [t1, t2, t3, t4];
  };

  const resetInteractiveDemo = () => {
    clearAllTimeouts();
    setIsRunningScan(false);
    setCompletedScan(false);
    setVisibleCount(0);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col font-sans selection:bg-emerald-100">
      {/* Top Navbar */}
      <header className="h-14 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 lg:px-12 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center">
          <span className="text-xl font-black tracking-tight text-zinc-950">
            API Trace
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onSwitchToApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <span>Launch Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 leading-[1.15]">
            Find API vulnerabilities <br className="hidden sm:inline" />
            <span className="text-emerald-700">before attackers do.</span>
          </h1>

          <p className="text-base text-zinc-600 max-w-xl mx-auto leading-relaxed">
            Run automated security checks, contract tests, and latency measurements directly from your OpenAPI link.
            No server agents to install, no code to modify, and no database changes.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onSwitchToApp}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all hover:gap-2.5"
            >
              <span>Open Developer Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={runInteractiveDemo}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-700 text-xs font-medium transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
              <span>Run Interactive Demo</span>
            </button>
          </div>
        </div>

        {/* Architecture Pipeline Diagram */}
        <section className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="border-b border-zinc-100 pb-4 space-y-1.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5 text-emerald-600" />
              <span>How It Works</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
              Three steps to test your API
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 max-w-2xl">
              Paste your OpenAPI link, let the automated tests run, and review the results. You do not need to install server software or change your code.
            </p>
          </div>

          {/* 3-Step Native Workflow Cards */}
          <div className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-4 relative">
            {/* Step 1: Connect */}
            <div className="flex-1 min-w-0 bg-[#fafafa] border border-zinc-200/90 rounded-xl p-5 flex flex-col justify-between shadow-2xs hover:border-zinc-300 transition-colors">
              <div className="h-[68px] flex flex-col justify-start">
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                  1. Connect Your API
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  Paste your OpenAPI or Swagger link. All endpoints are mapped automatically.
                </p>
              </div>

              {/* Step 1 Mockup */}
              <div className="mt-4 bg-white border border-zinc-200/80 rounded-lg p-3 h-[176px] flex flex-col justify-between shadow-2xs">
                {/* Browser address bar */}
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0 bg-zinc-50 border border-zinc-200/80 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-600 truncate">
                    https://api.example.com/openapi.json
                  </div>
                </div>

                {/* Endpoints list */}
                <div className="space-y-1.5 flex-1 flex flex-col justify-between pt-1.5">
                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-600 bg-zinc-200/70 px-1.5 py-0.5 rounded">
                        GET
                      </span>
                      <span className="text-zinc-700 truncate">/v1/products</span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" />
                  </div>

                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                        POST
                      </span>
                      <span className="text-zinc-700 truncate">/v1/orders</span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" />
                  </div>

                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs font-mono">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-600 bg-zinc-200/70 px-1.5 py-0.5 rounded">
                        GET
                      </span>
                      <span className="text-zinc-700 truncate">/v1/users/profile</span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-2" />
                  </div>
                </div>
              </div>
            </div>

            {/* In-Between Connector: Step 1 -> Step 2 */}
            <div className="hidden lg:flex self-center shrink-0 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow-xs items-center justify-center text-emerald-600 z-10">
              <ChevronRight className="w-4 h-4" />
            </div>
            <div className="flex lg:hidden justify-center text-emerald-600 py-1">
              <ChevronDown className="w-4 h-4" />
            </div>

            {/* Step 2: Automated Audit */}
            <div className="flex-1 min-w-0 bg-[#fafafa] border border-zinc-200/90 rounded-xl p-5 flex flex-col justify-between shadow-2xs hover:border-zinc-300 transition-colors">
              <div className="h-[68px] flex flex-col justify-start">
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                  2. Automated Audit
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  Tests security, speed, and contracts. Runs safely over HTTP without server agents.
                </p>
              </div>

              {/* Step 2 Mockup */}
              <div className="mt-4 bg-white border border-zinc-200/80 rounded-lg p-3 h-[176px] flex flex-col justify-between shadow-2xs">
                {/* Engine status header matching card 1 */}
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-mono font-medium text-zinc-700">Audit Suite Active</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    3/3 Passed
                  </span>
                </div>

                {/* Audit items matching card 1's 3 rows */}
                <div className="space-y-1.5 flex-1 flex flex-col justify-between pt-1.5">
                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-medium text-zinc-800 truncate">Security &amp; Auth</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-700 shrink-0 font-medium ml-2">Zero leaks</span>
                  </div>

                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-medium text-zinc-800 truncate">Response Latency</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-700 shrink-0 font-medium ml-2">Sub-50ms</span>
                  </div>

                  <div className="flex items-center justify-between bg-zinc-50/70 border border-zinc-200/60 rounded px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-xs font-medium text-zinc-800 truncate">Schema Conformance</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-700 shrink-0 font-medium ml-2">100% match</span>
                  </div>
                </div>
              </div>
            </div>

            {/* In-Between Connector: Step 2 -> Step 3 */}
            <div className="hidden lg:flex self-center shrink-0 w-8 h-8 rounded-full bg-white border border-zinc-200 shadow-xs items-center justify-center text-emerald-600 z-10">
              <ChevronRight className="w-4 h-4" />
            </div>
            <div className="flex lg:hidden justify-center text-emerald-600 py-1">
              <ChevronDown className="w-4 h-4" />
            </div>

            {/* Step 3: Clear Scorecards */}
            <div className="flex-1 min-w-0 bg-[#fafafa] border border-zinc-200/90 rounded-xl p-5 flex flex-col justify-between shadow-2xs hover:border-zinc-300 transition-colors">
              <div className="h-[68px] flex flex-col justify-start">
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                  3. Clear Scorecards
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  Actionable results in real time. Fix issues before deploying to production.
                </p>
              </div>

              {/* Step 3 Mockup */}
              <div className="mt-4 bg-white border border-zinc-200/80 rounded-lg p-3 h-[176px] flex flex-col justify-between shadow-2xs">
                {/* Health summary badge */}
                <div className="bg-zinc-50/70 border border-zinc-200/60 rounded p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                      OVERALL HEALTH
                    </div>
                    <div className="text-2xl font-black text-emerald-600 tracking-tight font-mono mt-0.5">
                      98%
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Ready to ship
                  </span>
                </div>

                {/* Metrics 3-column stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-zinc-50/70 border border-zinc-200/60 rounded p-2 text-center">
                    <div className="text-sm font-bold text-zinc-900 font-mono">48</div>
                    <div className="text-[10px] text-zinc-500 font-medium">Passed</div>
                  </div>
                  <div className="bg-zinc-50/70 border border-zinc-200/60 rounded p-2 text-center">
                    <div className="text-sm font-bold text-zinc-900 font-mono">24ms</div>
                    <div className="text-[10px] text-zinc-500 font-medium">Avg Speed</div>
                  </div>
                  <div className="bg-zinc-50/70 border border-zinc-200/60 rounded p-2 text-center">
                    <div className="text-sm font-bold text-emerald-600 font-mono">0</div>
                    <div className="text-[10px] text-zinc-500 font-medium">Criticals</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Live Scanner Sandbox */}
        <section className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          {/* Scanner Header */}
          <div className="px-5 py-3.5 border-b border-zinc-200 bg-zinc-50/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-zinc-800">
                Interactive test simulation
              </span>
              <span className="text-[11px] font-mono text-zinc-500 bg-zinc-200/60 px-2 py-0.5 rounded">
                openapi-v3.yaml
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runInteractiveDemo}
                disabled={isRunningScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-all shadow-xs"
              >
                {isRunningScan ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Running tests...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-white" />
                    <span>Run test simulation</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetInteractiveDemo}
                className="p-1.5 rounded border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-zinc-700 transition-colors"
                title="Reset simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Progress Indicator - Always mounted with h-1 to prevent layout shift */}
          <div className="h-1 bg-zinc-100 overflow-hidden">
            <div
              className={`h-full bg-emerald-600 transition-all duration-300 ${
                isRunningScan ? "w-full animate-pulse opacity-100" : "w-0 opacity-0"
              }`}
            />
          </div>

          {/* Results Visual Stream - Fixed 284px height so components below never move */}
          <div className="h-[284px] bg-white overflow-hidden">
            {visibleCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 select-none">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
                  <Play className="w-4 h-4 fill-emerald-600 ml-0.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-800">
                    Interactive simulation ready
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Click &quot;Run test simulation&quot; to test your endpoints in real time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {SAMPLE_RESULTS.slice(0, visibleCount).map((item, index) => (
                  <div
                    key={index}
                    className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50/50 transition-colors h-[71px]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.status === "pass" && (
                        <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {item.status === "warn" && (
                        <div className="w-6 h-6 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                      )}
                      {item.status === "fail" && (
                        <div className="w-6 h-6 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                          <XCircle className="w-3.5 h-3.5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                              item.method === "GET"
                                ? "bg-zinc-100 text-zinc-800 border-zinc-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {item.method}
                          </span>
                          <span className="font-mono text-xs font-semibold text-zinc-900 truncate">
                            {item.endpoint}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                          <strong className="text-zinc-700 font-medium">{item.check}:</strong>{" "}
                          {item.detail}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="font-mono text-[11px] text-zinc-400 w-12 text-right">
                        {item.latency}
                      </span>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border text-center w-18 ${
                          item.status === "pass"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-mono"
                            : item.status === "warn"
                            ? "bg-amber-50 text-amber-700 border-amber-200 font-mono"
                            : "bg-rose-50 text-rose-700 border-rose-200 font-mono"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Footer */}
          <div className="min-h-[44px] px-5 py-2.5 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500 font-mono">
            <span>
              {completedScan ? (
                <strong className="text-rose-600 font-semibold">
                  Scan complete: 1 issue found, 1 warning, 2 passed
                </strong>
              ) : isRunningScan ? (
                <strong className="text-emerald-700 font-semibold animate-pulse">
                  Executing probes against OpenAPI specification...
                </strong>
              ) : (
                <span>Click &quot;Run test simulation&quot; to test all 4 endpoints</span>
              )}
            </span>
            <button
              onClick={onSwitchToApp}
              className="text-emerald-700 hover:text-emerald-800 font-sans font-medium text-xs flex items-center gap-1"
            >
              <span>Open in Console</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Visual Feature Showcases */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Security */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs hover:border-zinc-300 transition-all flex flex-col">
            <div className="bg-zinc-50 border-b border-zinc-200 p-2">
              <img
                src="/feature-security.png"
                alt="Automated Security Testing"
                className="w-full h-44 object-contain rounded-lg"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Safety &amp; Privacy
                </span>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight mt-2">
                  Catch access issues early
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  Test for broken access control, missing tokens, and leaked error traces without touching your real database.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Performance */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs hover:border-zinc-300 transition-all flex flex-col">
            <div className="bg-zinc-50 border-b border-zinc-200 p-2">
              <img
                src="/feature-performance.png"
                alt="Response Speed and Latency Benchmarks"
                className="w-full h-44 object-contain rounded-lg"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Speed &amp; Latency
                </span>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight mt-2">
                  Measure real response times
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  See how fast your routes respond under repeated traffic so you can resolve bottlenecks before users feel them.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Contract Conformance */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs hover:border-zinc-300 transition-all flex flex-col">
            <div className="bg-zinc-50 border-b border-zinc-200 p-2">
              <img
                src="/feature-contract.png"
                alt="Contract Match and Schema Conformance"
                className="w-full h-44 object-contain rounded-lg"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Contract Match
                </span>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight mt-2">
                  Prevent breaking client changes
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed mt-1">
                  Confirm that live responses match your OpenAPI schema field by field, keeping mobile and web clients working reliably.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Numbers Bar */}
        <section className="border border-zinc-200 rounded-xl bg-white p-6 shadow-xs grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-black text-zinc-900 font-mono">0</div>
            <div className="text-xs text-zinc-500 mt-1">Server agents needed</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">100%</div>
            <div className="text-xs text-zinc-500 mt-1">Direct HTTP testing</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-zinc-900 font-mono">3.0 &amp; 3.1</div>
            <div className="text-xs text-zinc-500 mt-1">OpenAPI support</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">Live</div>
            <div className="text-xs text-zinc-500 mt-1">Real-time updates</div>
          </div>
        </section>

        {/* Direct CTA */}
        <section className="bg-zinc-900 text-white rounded-xl p-8 sm:p-10 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Ready to test your API?
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg">
              Open the developer console, paste your OpenAPI URL, and run your tests.
            </p>
          </div>

          <button
            type="button"
            onClick={onSwitchToApp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap self-stretch sm:self-auto justify-center"
          >
            <span>Open Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-4 px-6 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span>API Trace · Automated API testing</span>
          <span className="font-mono text-[11px] text-zinc-400">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
