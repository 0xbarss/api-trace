import type { MatrixRule, PlannerEndpointInput, TestPlanOptions } from "./types.js";

export function buildAuthProfileConfig(options?: TestPlanOptions): Record<string, unknown> | undefined {
  if (!options?.authProfiles) {
    return options?.config ? { ...options.config } : undefined;
  }
  return { ...(options.config ?? {}), authProfiles: options.authProfiles };
}

export function isAuthRequired(endpoint: PlannerEndpointInput): boolean {
  if (!endpoint.authType) {
    return false;
  }
  const normalized = endpoint.authType.trim().toLowerCase();
  return normalized !== "none" && normalized !== "";
}

export function hasIdInPath(endpoint: PlannerEndpointInput): boolean {
  const fromParams = endpoint.parameters?.some(
    (param) =>
      param.in === "path" &&
      (param.name.toLowerCase().includes("id") || param.name.toLowerCase().endsWith("_id"))
  );
  if (fromParams) {
    return true;
  }

  const tokenMatches = endpoint.path.match(/\{([^}]+)\}/g) ?? [];
  return tokenMatches.some((token) => {
    const clean = token.replace(/[{}]/g, "").toLowerCase();
    return clean.includes("id") || clean.endsWith("_id");
  });
}

export function isAdminRoute(endpoint: PlannerEndpointInput): boolean {
  return /\/(admin|audit|system)(\/|$)/i.test(endpoint.path);
}

export function isMutatingWithBody(endpoint: PlannerEndpointInput): boolean {
  const method = endpoint.method.toUpperCase();
  const isMutating = method === "POST" || method === "PUT" || method === "PATCH";
  return isMutating && endpoint.requestSchema != null;
}

export function hasQueryParamsOrBody(endpoint: PlannerEndpointInput): boolean {
  const hasQueryParams = Boolean(
    endpoint.parameters?.some((param) => param.in === "query")
  );
  return hasQueryParams || endpoint.requestSchema != null;
}

export const matrixRules: MatrixRule[] = [
  {
    name: "auth_missing_token",
    category: "security",
    description: "Verify authenticated route rejects unauthenticated requests",
    matches: isAuthRequired,
  },
  {
    name: "auth_malformed_token",
    category: "security",
    description: "Verify authenticated route rejects corrupted or malformed tokens",
    matches: isAuthRequired,
  },
  {
    name: "bola_unauthorized_object_access",
    category: "security",
    description: "Check that one tenant can't read another tenant's resource by replaying the request with the second tenant's token",
    matches: (endpoint) => isAuthRequired(endpoint) && hasIdInPath(endpoint),
    buildConfig: (_endpoint, options) => buildAuthProfileConfig(options),
  },
  {
    name: "bfla_privilege_escalation",
    category: "security",
    description: "Check that admin, audit, and system routes turn away regular users",
    // Matches on path alone: the flaw is that these routes expose admin data without requiring auth.
    matches: isAdminRoute,
    buildConfig: (_endpoint, options) => buildAuthProfileConfig(options),
  },
  {
    name: "mass_assignment_probe",
    category: "security",
    description: "Probe mutating endpoints for unintended property injection",
    matches: isMutatingWithBody,
    buildConfig: (_endpoint, options) => buildAuthProfileConfig(options),
  },
  {
    name: "business_logic_state_injection",
    category: "security",
    description: "Probe workflow endpoints for client-controlled state field injection",
    matches: isMutatingWithBody,
    buildConfig: (_endpoint, options) => buildAuthProfileConfig(options),
  },
  {
    name: "cors_wildcard_check",
    category: "security",
    description: "Verify CORS headers do not permit arbitrary origins on sensitive routes",
    matches: () => true,
  },
  {
    name: "rate_limit_burst_presence",
    category: "security",
    description: "Check for HTTP 429 throttling under high-concurrency request bursts",
    matches: () => true,
  },
  {
    name: "info_leakage_error_traces",
    category: "security",
    description: "Check for raw stack traces or database errors on malformed payloads",
    matches: () => true,
  },
  {
    name: "injection_signal_probe",
    category: "security",
    description: "Probe query parameters and request bodies for syntax error leakage",
    matches: hasQueryParamsOrBody,
  },
  {
    name: "polyglot_fuzz_injection_matrix",
    category: "security",
    description: "Dispatch NoSQL, command injection, path traversal, and SSRF payloads and detect leakage or blind time delays",
    matches: hasQueryParamsOrBody,
  },
  {
    name: "latency_baseline_distribution",
    category: "performance",
    description: "Measure p50, p95, and p99 response latencies over sample distribution",
    matches: () => true,
  },
  {
    name: "openapi_schema_conformance",
    category: "contract",
    description: "Validate response body structure against OpenAPI JSON Schema definition",
    matches: (endpoint) => endpoint.responseSchema != null,
  },
  {
    name: "status_code_declared_check",
    category: "contract",
    description: "Verify response status code matches documented specification codes",
    matches: () => true,
  },
  {
    name: "contract_negative_schema_mutation",
    category: "contract",
    description: "Verify mutating endpoint rejects malformed schemas and boundary violations with HTTP 400/422",
    matches: isMutatingWithBody,
  },
  {
    name: "http_verb_tampering",
    category: "security",
    description: "Verify auth middleware applies uniformly across HTTP methods not declared for this route",
    matches: isAuthRequired,
  },
  {
    name: "content_type_confusion",
    category: "security",
    description: "Probe request body parsing for XML entity expansion and missing content-type handling",
    matches: isMutatingWithBody,
  },
  {
    name: "header_injection_crlf",
    category: "security",
    description: "Check whether CRLF sequences in reflected header values are neutralized",
    matches: () => true,
  },
  {
    name: "sensitive_data_exposure",
    category: "security",
    description: "Scan authenticated GET response bodies for unmasked card numbers, CVV codes, and similar PII",
    matches: (endpoint) => isAuthRequired(endpoint) && endpoint.method.toUpperCase() === "GET" && endpoint.responseSchema != null,
    buildConfig: (_endpoint, options) => buildAuthProfileConfig(options),
  },
];
