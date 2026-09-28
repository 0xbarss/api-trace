import type { TestJobPayload } from "@apitrace/planner";
import type { TestExecutionResult } from "../types.js";
import type { HttpProbeClient } from "../http/client.js";
import { interpolatePath, truncate, buildSampleBody } from "../utils.js";

const SENSITIVE_HEADERS = new Set(["set-cookie", "cookie", "authorization"]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase()))
  );
}

const TAMPER_METHODS = ["HEAD", "OPTIONS", "PATCH", "PUT"] as const;

// OPTIONS answering with CORS or Allow headers is normal preflight behavior, not an auth bypass
function isPreflightResponse(
  method: string,
  statusCode: number,
  headers: Record<string, string>
): boolean {
  if (method !== "OPTIONS" || statusCode < 200 || statusCode >= 300) {
    return false;
  }
  return "allow" in headers || "access-control-allow-methods" in headers;
}

export async function runHttpVerbTamperingCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const declaredMethod = job.method.toUpperCase();

  const candidateMethods = TAMPER_METHODS.filter((m) => m !== declaredMethod);

  let totalLatency = 0;
  let testedCount = 0;

  for (const method of candidateMethods) {
    const res = await client.send(job.baseUrl, { method, path });
    totalLatency += res.latencyMs;
    testedCount++;

    if (isPreflightResponse(method, res.statusCode, res.headers)) {
      continue;
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return {
        status: "fail",
        severity: "high",
        latencyMs: Math.round(totalLatency / testedCount),
        detail: {
          evidence: `Route requiring authentication on ${declaredMethod} accepted ${method} without auth enforcement, returning HTTP ${res.statusCode}.`,
          requestSent: {
            method,
            url: targetUrl,
          },
          responseReceived: {
            status: res.statusCode,
            headers: redactHeaders(res.headers),
            body: truncate(res.body),
          },
          remediation:
            "Apply the authentication middleware to every HTTP method registered on this route, not just the declared one.",
        },
      };
    }
  }

  const avgLatency = testedCount > 0 ? Math.round(totalLatency / testedCount) : 0;

  return {
    status: "pass",
    severity: "info",
    latencyMs: avgLatency,
    detail: {
      evidence: `Auth enforcement held across ${testedCount} alternate HTTP methods (${candidateMethods.join(", ")}).`,
      requestSent: {
        method: declaredMethod,
        url: targetUrl,
      },
      responseReceived: {
        status: 401,
      },
    },
  };
}

const XXE_PAYLOAD =
  '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>';

export async function runContentTypeConfusionCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  const xmlRes = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: { "content-type": "application/xml" },
    body: XXE_PAYLOAD,
  });

  const leakSignal = /^root:[^:\n]*:0:0:/m.test(xmlRes.body);
  if (leakSignal) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: xmlRes.latencyMs,
      detail: {
        evidence: "Endpoint parsed an XML body containing an external entity declaration and reflected file or parser content in the response.",
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { "content-type": "application/xml" },
          body: XXE_PAYLOAD,
        },
        responseReceived: {
          status: xmlRes.statusCode,
          headers: redactHeaders(xmlRes.headers),
          body: truncate(xmlRes.body),
        },
        remediation: "Disable external entity resolution in the XML parser, or reject unexpected content types outright.",
      },
    };
  }

  const sampleBody = buildSampleBody(job.requestSchema) ?? { test: "value" };
  const noHeaderRes = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: { "content-type": "" },
    body: JSON.stringify(sampleBody),
  });

  if (noHeaderRes.statusCode >= 500) {
    return {
      status: "fail",
      severity: "medium",
      latencyMs: noHeaderRes.latencyMs,
      detail: {
        evidence: `Sending a body with no content-type header crashed the endpoint with HTTP ${noHeaderRes.statusCode} instead of a clean 4xx rejection.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { "content-type": "" },
          body: sampleBody,
        },
        responseReceived: {
          status: noHeaderRes.statusCode,
          headers: redactHeaders(noHeaderRes.headers),
          body: truncate(noHeaderRes.body),
        },
        remediation: "Validate the content-type header at the parser boundary and reject unparseable bodies with HTTP 400.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: Math.round((xmlRes.latencyMs + noHeaderRes.latencyMs) / 2),
    detail: {
      evidence: "No entity expansion signal on XML content-type, and a missing content-type header did not crash the endpoint.",
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: noHeaderRes.statusCode,
      },
    },
  };
}

export async function runHeaderInjectionCrlfCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  const marker = "apitrace-crlf-probe";
  const payload = `${marker}%0d%0aSet-Cookie:%20apitrace-injected=1`;

  const probeUrl = `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}apitraceProbe=${payload}`;
  const res = await client.send(job.baseUrl, { method: job.method, url: probeUrl });

  const injected = (res.headers["set-cookie"] ?? "").includes("apitrace-injected=1");

  if (injected) {
    return {
      status: "fail",
      severity: "high",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "A CRLF sequence in a query value was decoded into the response headers, allowing an injected Set-Cookie header to appear.",
        requestSent: {
          method: job.method,
          url: probeUrl,
        },
        responseReceived: {
          status: res.statusCode,
          headers: redactHeaders(res.headers),
        },
        remediation: "Strip or reject CR and LF characters from any user-controlled value before writing it into a response header.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: "CRLF sequences in request headers were not reflected into response headers.",
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
      },
    },
  };
}

export async function runProtocolProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  switch (job.testName) {
    case "content_type_confusion":
      return runContentTypeConfusionCheck(job, client);
    case "header_injection_crlf":
      return runHeaderInjectionCrlfCheck(job, client);
    case "http_verb_tampering":
    default:
      return runHttpVerbTamperingCheck(job, client);
  }
}
