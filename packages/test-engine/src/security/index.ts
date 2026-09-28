import type { TestJobPayload } from "@apitrace/planner";
import type { TargetAuthProfiles } from "@apitrace/core";
import type { TestExecutionResult } from "../types.js";
import type { HttpProbeClient } from "../http/client.js";
import { interpolatePath, truncate, buildSampleBody, buildAuthHeaders } from "../utils.js";
import { runPolyglotFuzzProbe } from "../fuzzing/index.js";
import { runProtocolProbe } from "../protocol/index.js";

const CROSS_TENANT_RESOURCE_ID = "500001";

const KNOWN_STACK_PATTERNS = [
  /at\s+[\w\d_.]+\s+\(.*:\d+:\d+\)/i,
  /File\s+".*",\s+line\s+\d+/i,
  /Traceback \(most recent call last\):/i,
  /java\.lang\.\w+Exception/i,
  /syntax error at or near/i,
  /ORA-\d{5}/i,
  /SequelizeDatabaseError|QueryFailedError/i,
  /UnhandledPromiseRejection/i,
  /SQLSTATE\[/i,
];

const SQL_SYNTAX_ERROR_PATTERNS = [
  /syntax error at or near/i,
  /syntax error near/i,
  /near ".*": syntax error/i,
  /unclosed quotation mark/i,
  /SQLSTATE\[/i,
  /QueryFailedError/i,
  /SequelizeDatabaseError/i,
  /pg_query\(\)/i,
  /mysql_fetch_array/i,
  /sqlite3::/i,
  /SqliteError/i,
];

export async function runAuthMissingCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
  });

  if (res.statusCode >= 200 && res.statusCode < 300) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Endpoint declared authType="${job.authType}", but returned HTTP ${res.statusCode} without credentials.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Apply authentication middleware to protect this route.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `Correctly rejected unauthenticated request with HTTP ${res.statusCode}.`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

export async function runAuthMalformedCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: {
      authorization: "Bearer invalid_malformed_token_probe_test",
    },
  });

  if (res.statusCode >= 200 && res.statusCode < 300) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Endpoint accepted corrupted token and returned HTTP ${res.statusCode}.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { authorization: "Bearer [redacted]" },
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Validate JWT/token signature and expiry before honoring request claims.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `Correctly rejected malformed token with HTTP ${res.statusCode}.`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

export async function runBolaUnauthorizedAccessCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const primary = authProfiles?.primary;
  const secondary = authProfiles?.secondary;

  if (!primary || !secondary) {
    return {
      status: "warn",
      severity: "medium",
      latencyMs: 0,
      detail: {
        evidence: "Skipped: this target has no Tenant A and Tenant B auth profiles, so there was no way to check whether one tenant can read another tenant's data.",
        remediation: "Add a token for each tenant under Auth profiles for this target, then run the tests again.",
      },
    };
  }

  const path = interpolatePath(job.path, job.parameters, {
    id: CROSS_TENANT_RESOURCE_ID,
    user_id: CROSS_TENANT_RESOURCE_ID,
    userId: CROSS_TENANT_RESOURCE_ID,
  });
  const targetUrl = client.buildUrl(job.baseUrl, path);

  const primaryRes = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: buildAuthHeaders(primary),
  });

  if (primaryRes.statusCode < 200 || primaryRes.statusCode >= 300) {
    return {
      status: "warn",
      severity: "low",
      latencyMs: primaryRes.latencyMs,
      detail: {
        evidence: `Couldn't get a baseline: ${primary.name} received HTTP ${primaryRes.statusCode} for this ID, so there was nothing to compare the other tenant against.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { authorization: "Bearer [redacted]" },
        },
        responseReceived: {
          status: primaryRes.statusCode,
          headers: primaryRes.headers,
        },
        remediation: "Use a resource ID that the first tenant really owns, so the comparison means something.",
      },
    };
  }

  const secondaryRes = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: buildAuthHeaders(secondary),
  });

  if (secondaryRes.statusCode >= 200 && secondaryRes.statusCode < 300) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: secondaryRes.latencyMs,
      detail: {
        evidence: `${secondary.name} was able to read a resource that belongs to ${primary.name} and got HTTP ${secondaryRes.statusCode}.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { authorization: "Bearer [redacted]" },
        },
        responseReceived: {
          status: secondaryRes.statusCode,
          headers: secondaryRes.headers,
          body: truncate(secondaryRes.body),
        },
        remediation: "Check that the caller owns a resource before returning it, and scope every lookup to the caller's tenant.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: secondaryRes.latencyMs,
    detail: {
      evidence: `${secondary.name} asked for a resource that belongs to ${primary.name} and was correctly turned away with HTTP ${secondaryRes.statusCode}.`,
      requestSent: {
        method: job.method,
        url: targetUrl,
        headers: { authorization: "Bearer [redacted]" },
      },
      responseReceived: {
        status: secondaryRes.statusCode,
        headers: secondaryRes.headers,
      },
    },
  };
}

export async function runBflaPrivilegeEscalationCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const caller = authProfiles?.unprivileged ?? authProfiles?.secondary;

  if (!caller) {
    return {
      status: "warn",
      severity: "medium",
      latencyMs: 0,
      detail: {
        evidence: "Skipped: this target has no Unprivileged or Tenant B auth profile, so there was no regular user to try this admin route with.",
        remediation: "Add a regular user's token under Auth profiles for this target, then run the tests again.",
      },
    };
  }

  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: buildAuthHeaders(caller),
  });

  if (res.statusCode >= 200 && res.statusCode < 300) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `This admin route let in ${caller.name}, who isn't an admin, and returned HTTP ${res.statusCode}.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { authorization: "Bearer [redacted]" },
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Check the caller's role or scope on admin routes. Being logged in shouldn't be enough.",
      },
    };
  }

  if (res.statusCode !== 403) {
    return {
      status: "warn",
      severity: "low",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `This admin route turned ${caller.name} away, but with HTTP ${res.statusCode} instead of the HTTP 403 you'd expect.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { authorization: "Bearer [redacted]" },
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
        },
        remediation: "Return 403 Forbidden when a signed-in caller doesn't have the right role or scope.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `This admin route correctly turned ${caller.name} away with HTTP 403.`,
      requestSent: {
        method: job.method,
        url: targetUrl,
        headers: { authorization: "Bearer [redacted]" },
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

export async function runMassAssignmentProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const sampleBody = buildSampleBody(job.requestSchema) ?? {};

  const adminProbePayload: Record<string, unknown> = {
    ...sampleBody,
    role: "admin",
    isAdmin: true,
    isSuperuser: true,
    accessLevel: 9999,
  };

  const anonRes = await client.send(job.baseUrl, {
    method: job.method,
    path,
    body: adminProbePayload,
  });

  if (anonRes.json && typeof anonRes.json === "object") {
    const jsonRecord = anonRes.json as Record<string, unknown>;
    if (
      jsonRecord["role"] === "admin" ||
      jsonRecord["isAdmin"] === true ||
      jsonRecord["isSuperuser"] === true
    ) {
      return {
        status: "fail",
        severity: "high",
        latencyMs: anonRes.latencyMs,
        detail: {
          evidence: "Endpoint echoed back injected administrative properties (mass assignment vulnerability).",
          requestSent: {
            method: job.method,
            url: targetUrl,
            body: adminProbePayload,
          },
          responseReceived: {
            status: anonRes.statusCode,
            headers: anonRes.headers,
            body: truncate(anonRes.body),
          },
          remediation: "Implement strict input DTO allow-lists and sanitize input properties before model binding.",
        },
      };
    }
  }

  // Auth-aware numeric field injection: catches endpoints that silently write
  // attacker-supplied financial fields without echoing them back.
  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const primaryAuth = authProfiles?.primary;

  if (primaryAuth) {
    const numericProbePayload: Record<string, unknown> = {
      ...sampleBody,
      balance: 999999999,
      overdraftLimit: 999999999,
      creditLimit: 999999999,
      price: 0.01,
      amount: 999999999,
    };

    const authRes = await client.send(job.baseUrl, {
      method: job.method,
      path,
      headers: buildAuthHeaders(primaryAuth),
      body: numericProbePayload,
    });

    if (authRes.statusCode >= 200 && authRes.statusCode < 300) {
      return {
        status: "fail",
        severity: "high",
        latencyMs: authRes.latencyMs,
        detail: {
          evidence: `Endpoint accepted injected sensitive numeric fields and returned HTTP ${authRes.statusCode}. The server may have written attacker-supplied values directly to the database.`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            body: numericProbePayload,
          },
          responseReceived: {
            status: authRes.statusCode,
            headers: authRes.headers,
            body: truncate(authRes.body),
          },
          remediation: "Validate and allowlist every writable field server-side; reject or ignore unexpected fields regardless of the caller's auth status.",
        },
      };
    }
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: anonRes.latencyMs,
    detail: {
      evidence: `Endpoint safely rejected or filtered unauthorized fields (HTTP ${anonRes.statusCode}).`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: anonRes.statusCode,
        headers: anonRes.headers,
      },
    },
  };
}

export async function runCorsWildcardCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const untrustedOrigin = "https://evil-attacker.example.com";

  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: {
      origin: untrustedOrigin,
    },
  });

  const allowOrigin = res.headers["access-control-allow-origin"];
  const allowCredentials = res.headers["access-control-allow-credentials"];

  if (allowOrigin === untrustedOrigin && allowCredentials === "true") {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "Insecure CORS configuration: reflects arbitrary origin with Access-Control-Allow-Credentials: true.",
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { origin: untrustedOrigin },
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
        },
        remediation: "Maintain a strict whitelist of allowed origins and never reflect untrusted origins when credentials are supported.",
      },
    };
  }

  if (allowOrigin === "*" && job.authType !== "none") {
    return {
      status: "warn",
      severity: "medium",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "Authenticated route exposes wildcard Access-Control-Allow-Origin: * header.",
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { origin: untrustedOrigin },
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
        },
        remediation: "Restrict Access-Control-Allow-Origin to authorized frontend domains.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: "CORS configuration does not expose sensitive endpoints to untrusted origins.",
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

export async function runRateLimitBurstCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const burstCount = typeof job.config?.burstCount === "number" ? job.config.burstCount : 30;

  const responses = await client.burst(
    job.baseUrl,
    {
      method: job.method,
      path,
    },
    burstCount
  );

  const totalLatency = responses.reduce((acc, r) => acc + r.latencyMs, 0);
  const avgLatency = Math.round(totalLatency / (responses.length || 1));
  const rateLimitHit = responses.some((r) => r.statusCode === 429);

  if (!rateLimitHit) {
    return {
      status: "warn",
      severity: "medium",
      latencyMs: avgLatency,
      detail: {
        evidence: `Dispatched ${burstCount} concurrent requests; none triggered HTTP 429 rate limiting.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          headers: { "x-burst-size": String(burstCount) },
        },
        remediation: "Implement rate-limiting middleware (such as sliding window or token bucket) to protect endpoints from abuse.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: avgLatency,
    detail: {
      evidence: `Rate limiter triggered successfully (detected HTTP 429 in ${burstCount} request burst).`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: 429,
      },
    },
  };
}

export async function runInfoLeakageCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const malformedPayload = "{ malformed_json: true, ";

  const res = await client.send(job.baseUrl, {
    method: job.method === "GET" ? "POST" : job.method,
    path,
    headers: {
      "content-type": "application/json",
    },
    body: malformedPayload,
  });

  const matchedPattern = KNOWN_STACK_PATTERNS.find((pattern) => pattern.test(res.body));

  if (matchedPattern) {
    return {
      status: "fail",
      severity: "high",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Response body leaked internal trace or DBMS error signature: ${matchedPattern.toString()}`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          body: malformedPayload,
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Sanitize error responses in production using a centralized error handler returning opaque error correlation IDs.",
      },
    };
  }

  // GET endpoints ignore request bodies, so also probe query params with a malformed value.
  if (job.method.toUpperCase() === "GET") {
    const queryParams: Record<string, string> = { q: "'\";--" };
    if (job.parameters) {
      for (const p of job.parameters) {
        if (p.in === "query") {
          queryParams[p.name] = "'\";--";
        }
      }
    }

    const queryRes = await client.send(job.baseUrl, {
      method: "GET",
      path,
      query: queryParams,
    });

    const queryMatchedPattern = KNOWN_STACK_PATTERNS.find((pattern) => pattern.test(queryRes.body));

    if (queryMatchedPattern) {
      return {
        status: "fail",
        severity: "high",
        latencyMs: queryRes.latencyMs,
        detail: {
          evidence: `Response body leaked internal trace or DBMS error signature via query parameter: ${queryMatchedPattern.toString()}`,
          requestSent: {
            method: "GET",
            url: client.buildUrl(job.baseUrl, path, queryParams),
          },
          responseReceived: {
            status: queryRes.statusCode,
            headers: queryRes.headers,
            body: truncate(queryRes.body),
          },
          remediation: "Sanitize error responses in production using a centralized error handler returning opaque error correlation IDs.",
        },
      };
    }
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `Error response did not leak internal stack traces (HTTP ${res.statusCode}).`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

export async function runInjectionSignalProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const injectionPayloads = ["' OR '1'='1", "1' OR 1=1--", "'"];

  let lastStatus = 200;
  let lastHeaders: Record<string, string> = {};
  let lastLatency = 0;

  for (const payload of injectionPayloads) {
    const queryParams: Record<string, string> = {};
    if (job.parameters) {
      for (const p of job.parameters) {
        if (p.in === "query") {
          queryParams[p.name] = payload;
        }
      }
    }

    const res = await client.send(job.baseUrl, {
      method: job.method,
      path,
      query: Object.keys(queryParams).length > 0 ? queryParams : { q: payload },
      body:
        job.method !== "GET"
          ? {
              query: payload,
              filter: payload,
            }
          : undefined,
    });

    lastStatus = res.statusCode;
    lastHeaders = res.headers;
    lastLatency = res.latencyMs;

    const matchedPattern = SQL_SYNTAX_ERROR_PATTERNS.find((pattern) => pattern.test(res.body));

    if (matchedPattern) {
      return {
        status: "fail",
        severity: "critical",
        latencyMs: res.latencyMs,
        detail: {
          evidence: `Database syntax error leaked on injection probe payload: ${matchedPattern.toString()}`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            headers: { "x-probe-type": "injection-signal" },
            body: job.method !== "GET" ? { query: payload } : undefined,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
            body: truncate(res.body),
          },
          remediation: "Use parameterized queries and prepared statements exclusively to prevent SQL injection.",
        },
      };
    }
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: lastLatency,
    detail: {
      evidence: `No database syntax error leaked upon injection probe (HTTP ${lastStatus}).`,
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

export async function runBusinessLogicStateInjectionProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);
  const sampleBody = buildSampleBody(job.requestSchema) ?? {};

  const stateFields: Record<string, unknown> = {
    ...sampleBody,
    status: "force_approved_by_attacker",
    state: "approved",
    approved: true,
    verified: true,
    cleared: true,
  };

  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const primaryAuth = authProfiles?.primary;

  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: primaryAuth ? buildAuthHeaders(primaryAuth) : undefined,
    body: stateFields,
  });

  if (res.statusCode >= 200 && res.statusCode < 300) {
    return {
      status: "fail",
      severity: "high",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Endpoint accepted attacker-controlled state fields and returned HTTP ${res.statusCode}. The server may have bypassed its own state machine enforcement.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
          body: stateFields,
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Enforce state transitions server-side; never trust client-supplied status or approval fields.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `Endpoint rejected attacker-controlled state fields (HTTP ${res.statusCode}).`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: res.statusCode,
        headers: res.headers,
      },
    },
  };
}

const PAN_PATTERNS = [
  /\b4[0-9]{12}(?:[0-9]{3})?\b/,
  /\b5[1-5][0-9]{14}\b/,
  /\b3[47][0-9]{13}\b/,
  /\b6(?:011|5[0-9]{2})[0-9]{12}\b/,
];

const CVV_PATTERN = /"cvv"\s*:\s*"\d{3,4}"/i;

export async function runSensitiveDataExposureCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const primaryAuth = authProfiles?.primary;

  if (!primaryAuth) {
    return {
      status: "warn",
      severity: "medium",
      latencyMs: 0,
      detail: {
        evidence: "Skipped: no primary auth profile configured, so the endpoint could not be fetched as an authenticated caller.",
        remediation: "Add a primary auth token under Auth profiles for this target, then run the tests again.",
      },
    };
  }

  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
    headers: buildAuthHeaders(primaryAuth),
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    return {
      status: "warn",
      severity: "low",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Could not fetch a successful response to scan (HTTP ${res.statusCode}).`,
        requestSent: { method: job.method, url: targetUrl },
        responseReceived: { status: res.statusCode, headers: res.headers },
      },
    };
  }

  const matchedPan = PAN_PATTERNS.find((p) => p.test(res.body));
  if (matchedPan) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "Response body contains what appears to be an unmasked payment card number (PAN).",
        requestSent: { method: job.method, url: targetUrl },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Mask PANs to the last four digits before including them in API responses.",
      },
    };
  }

  if (CVV_PATTERN.test(res.body)) {
    return {
      status: "fail",
      severity: "critical",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "Response body contains a raw CVV code field.",
        requestSent: { method: job.method, url: targetUrl },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Never return CVV codes in API responses. Remove the field entirely.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: "No unmasked card numbers or CVV codes detected in the response body.",
      requestSent: { method: job.method, url: targetUrl },
      responseReceived: { status: res.statusCode, headers: res.headers },
    },
  };
}

export async function runSecurityProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  switch (job.testName) {
    case "auth_missing_token":
      return runAuthMissingCheck(job, client);
    case "auth_malformed_token":
      return runAuthMalformedCheck(job, client);
    case "bola_unauthorized_object_access":
      return runBolaUnauthorizedAccessCheck(job, client);
    case "bfla_privilege_escalation":
      return runBflaPrivilegeEscalationCheck(job, client);
    case "mass_assignment_probe":
      return runMassAssignmentProbe(job, client);
    case "business_logic_state_injection":
      return runBusinessLogicStateInjectionProbe(job, client);
    case "cors_wildcard_check":
      return runCorsWildcardCheck(job, client);
    case "rate_limit_burst_presence":
      return runRateLimitBurstCheck(job, client);
    case "info_leakage_error_traces":
      return runInfoLeakageCheck(job, client);
    case "injection_signal_probe":
      return runInjectionSignalProbe(job, client);
    case "polyglot_fuzz_injection_matrix":
      return runPolyglotFuzzProbe(job, client);
    case "sensitive_data_exposure":
      return runSensitiveDataExposureCheck(job, client);
    case "http_verb_tampering":
    case "content_type_confusion":
    case "header_injection_crlf":
      return runProtocolProbe(job, client);
    default:
      return runAuthMissingCheck(job, client);
  }
}
