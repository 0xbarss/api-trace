import type { TestJobPayload } from "@apitrace/planner";
import type {
  ProbeEngineOptions,
  RegisteredRunner,
  TestExecutionResult,
} from "./types.js";
import { HttpProbeClient, HttpProbeError } from "./http/client.js";
import { runSecurityProbe } from "./security/index.js";
import { runPerformanceProbe } from "./performance/index.js";
import { runContractProbe } from "./contract/index.js";

export const registeredRunners: RegisteredRunner[] = [
  {
    name: "auth_missing_token",
    category: "security",
    description: "Verify authenticated route rejects unauthenticated requests",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "auth_malformed_token",
    category: "security",
    description: "Verify authenticated route rejects corrupted or malformed tokens",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "bola_unauthorized_object_access",
    category: "security",
    description: "Check that one tenant can't read another tenant's resource by replaying the request with the second tenant's token",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "bfla_privilege_escalation",
    category: "security",
    description: "Check that admin, audit, and system routes turn away regular users",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "mass_assignment_probe",
    category: "security",
    description: "Probe mutating endpoints for unintended property injection",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "cors_wildcard_check",
    category: "security",
    description: "Verify CORS headers do not permit arbitrary origins on sensitive routes",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "rate_limit_burst_presence",
    category: "security",
    description: "Check for HTTP 429 throttling under high-concurrency request bursts",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "info_leakage_error_traces",
    category: "security",
    description: "Check for raw stack traces or database errors on malformed payloads",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "injection_signal_probe",
    category: "security",
    description: "Probe query parameters and request bodies for syntax error leakage",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "polyglot_fuzz_injection_matrix",
    category: "security",
    description: "Dispatch NoSQL, command injection, path traversal, and SSRF payloads and detect leakage or blind time delays",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "latency_baseline_distribution",
    category: "performance",
    description: "Measure p50, p95, and p99 response latencies over sample distribution",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "openapi_schema_conformance",
    category: "contract",
    description: "Validate response body structure against OpenAPI JSON Schema definition",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "status_code_declared_check",
    category: "contract",
    description: "Verify response status code matches documented specification codes",
    run: (job, opts) => executeTestJob(job, opts),
  },
  {
    name: "contract_negative_schema_mutation",
    category: "contract",
    description: "Verify mutating endpoint rejects malformed schemas and boundary violations with HTTP 400/422",
    run: (job, opts) => executeTestJob(job, opts),
  },
];

export async function executeTestJob(
  job: TestJobPayload,
  options?: ProbeEngineOptions,
  client?: HttpProbeClient
): Promise<TestExecutionResult> {
  const probeClient = client ?? new HttpProbeClient(options);
  const shouldCloseClient = client === undefined;

  try {
    switch (job.category) {
      case "security":
        return await runSecurityProbe(job, probeClient);
      case "performance":
        return await runPerformanceProbe(job, probeClient);
      case "contract":
        return await runContractProbe(job, probeClient);
      default:
        return {
          status: "warn",
          severity: "low",
          latencyMs: 0,
          detail: {
            evidence: `Unknown test category "${String(job.category)}" for test "${job.testName}".`,
          },
        };
    }
  } catch (err: unknown) {
    const latencyMs = err instanceof HttpProbeError ? err.latencyMs : 0;
    const message = err instanceof Error ? err.message : String(err);

    return {
      status: "error",
      severity: "medium",
      latencyMs,
      detail: {
        evidence: `Probe execution failed: ${message}`,
        requestSent: {
          method: job.method,
          url: `${job.baseUrl}${job.path}`,
        },
      },
    };
  } finally {
    if (shouldCloseClient) {
      await probeClient.close();
    }
  }
}
