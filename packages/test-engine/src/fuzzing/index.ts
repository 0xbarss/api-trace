import type { TestJobPayload } from "@apitrace/planner";
import type { ProbeResponse, TestExecutionResult } from "../types.js";
import type { HttpProbeClient } from "../http/client.js";
import { interpolatePath, truncate } from "../utils.js";
import {
  NOSQL_INJECTION_PAYLOADS,
  COMMAND_INJECTION_PAYLOADS,
  COMMAND_INJECTION_BLIND_PAYLOADS,
  PATH_TRAVERSAL_PAYLOADS,
  SSRF_PAYLOADS,
  COMMAND_OUTPUT_LEAK_PATTERNS,
  PATH_TRAVERSAL_LEAK_PATTERNS,
  SSRF_LEAK_PATTERNS,
  type FuzzCategory,
  type FuzzPayload,
} from "./payloads.js";

const BLIND_DELAY_THRESHOLD_MS = 2500;
const BASELINE_PROBE_VALUE = "fuzz_baseline_probe_value";

const CATEGORY_LABELS: Record<FuzzCategory, string> = {
  nosql_injection: "NoSQL injection",
  command_injection: "Command injection",
  path_traversal: "Path traversal",
  ssrf: "SSRF",
};

const REMEDIATIONS: Record<FuzzCategory, string> = {
  nosql_injection:
    "Validate that query filter fields are primitive scalar values before passing them to the database driver, rejecting objects/operators from client input.",
  command_injection:
    "Never pass user input to a shell; use language-native APIs or an allow-listed argument array instead of string concatenation into a shell command.",
  path_traversal:
    "Resolve file paths against an allow-listed base directory and reject any path containing traversal sequences.",
  ssrf: "Block outbound requests to link-local and loopback address ranges from server-side URL fetchers; require an allow-list of destination hosts.",
};

function buildFuzzedRequest(job: TestJobPayload, value: string) {
  const queryParams: Record<string, string> = {};
  if (job.parameters) {
    for (const p of job.parameters) {
      if (p.in === "query") {
        queryParams[p.name] = value;
      }
    }
  }

  return {
    query: Object.keys(queryParams).length > 0 ? queryParams : { q: value },
    body:
      job.method !== "GET"
        ? { query: value, filter: value, url: value, target: value }
        : undefined,
  };
}

async function dispatchFuzzValue(
  job: TestJobPayload,
  client: HttpProbeClient,
  path: string,
  value: string
): Promise<ProbeResponse> {
  const { query, body } = buildFuzzedRequest(job, value);
  return client.send(job.baseUrl, {
    method: job.method,
    path,
    query,
    body,
  });
}

function isEmptyResult(json: unknown): boolean {
  if (json === null || json === undefined) {
    return true;
  }
  if (Array.isArray(json)) {
    return json.length === 0;
  }
  if (typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record["results"])) {
      return (record["results"] as unknown[]).length === 0;
    }
    if (Array.isArray(record["data"])) {
      return (record["data"] as unknown[]).length === 0;
    }
    return Object.keys(record).length === 0;
  }
  return false;
}

function buildLeakResult(
  job: TestJobPayload,
  targetUrl: string,
  payload: FuzzPayload,
  res: ProbeResponse,
  matchedPattern: RegExp
): TestExecutionResult {
  return {
    status: "fail",
    severity: "critical",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `${CATEGORY_LABELS[payload.category]} confirmed: response leaked signature matching ${matchedPattern.toString()} for payload "${payload.description}".`,
      requestSent: {
        method: job.method,
        url: targetUrl,
        body: job.method !== "GET" ? { query: payload.value } : undefined,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
        body: truncate(res.body),
      },
      remediation: REMEDIATIONS[payload.category],
    },
  };
}

export async function runPolyglotFuzzProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  let lastStatus = 200;
  let lastHeaders: Record<string, string> = {};
  let lastLatency = 0;

  const reflectedVectors: Array<{ payloads: FuzzPayload[]; patterns: RegExp[] }> = [
    { payloads: COMMAND_INJECTION_PAYLOADS, patterns: COMMAND_OUTPUT_LEAK_PATTERNS },
    { payloads: PATH_TRAVERSAL_PAYLOADS, patterns: PATH_TRAVERSAL_LEAK_PATTERNS },
    { payloads: SSRF_PAYLOADS, patterns: SSRF_LEAK_PATTERNS },
  ];

  for (const vector of reflectedVectors) {
    for (const payload of vector.payloads) {
      const res = await dispatchFuzzValue(job, client, path, payload.value);
      lastStatus = res.statusCode;
      lastHeaders = res.headers;
      lastLatency = res.latencyMs;

      const matched = vector.patterns.find((pattern) => pattern.test(res.body));
      if (matched) {
        return buildLeakResult(job, targetUrl, payload, res, matched);
      }
    }
  }

  // NoSQL operator injection: an operator payload succeeding where an equivalent
  // literal value is rejected or empty indicates the filter is not sanitized.
  const baselineRes = await dispatchFuzzValue(job, client, path, BASELINE_PROBE_VALUE);
  lastStatus = baselineRes.statusCode;
  lastHeaders = baselineRes.headers;
  lastLatency = baselineRes.latencyMs;
  const baselineRejected = baselineRes.statusCode >= 400 || isEmptyResult(baselineRes.json);

  for (const payload of NOSQL_INJECTION_PAYLOADS) {
    const res = await dispatchFuzzValue(job, client, path, payload.value);
    lastStatus = res.statusCode;
    lastHeaders = res.headers;
    lastLatency = res.latencyMs;

    const payloadAccepted = res.statusCode >= 200 && res.statusCode < 300 && !isEmptyResult(res.json);
    if (baselineRejected && payloadAccepted) {
      return {
        status: "warn",
        severity: "high",
        latencyMs: res.latencyMs,
        detail: {
          evidence: `NoSQL operator injection suspected: query object payload "${payload.description}" returned HTTP ${res.statusCode} with data, while an equivalent literal value was rejected or empty.`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            body: job.method !== "GET" ? { query: payload.value } : undefined,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
            body: truncate(res.body),
          },
          remediation: REMEDIATIONS.nosql_injection,
        },
      };
    }
  }

  // Blind command injection: no output is reflected, so a sleep payload is
  // flagged by comparing its latency against a same-shape baseline request.
  const timingBaseline = await dispatchFuzzValue(job, client, path, BASELINE_PROBE_VALUE);
  lastStatus = timingBaseline.statusCode;
  lastHeaders = timingBaseline.headers;
  lastLatency = timingBaseline.latencyMs;

  for (const payload of COMMAND_INJECTION_BLIND_PAYLOADS) {
    const res = await dispatchFuzzValue(job, client, path, payload.value);
    lastStatus = res.statusCode;
    lastHeaders = res.headers;
    lastLatency = res.latencyMs;

    const delta = res.latencyMs - timingBaseline.latencyMs;
    if (delta >= BLIND_DELAY_THRESHOLD_MS) {
      return {
        status: "fail",
        severity: "critical",
        latencyMs: res.latencyMs,
        detail: {
          evidence: `Blind command injection suspected: payload "${payload.description}" added ${delta}ms of latency over the ${timingBaseline.latencyMs}ms baseline.`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            body: job.method !== "GET" ? { query: payload.value } : undefined,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
          },
          remediation: REMEDIATIONS.command_injection,
        },
      };
    }
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: lastLatency,
    detail: {
      evidence: `No NoSQL, command injection, path traversal, or SSRF signal detected across polyglot fuzzing matrix (HTTP ${lastStatus}).`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: lastStatus,
        headers: lastHeaders,
      },
    },
  };
}
