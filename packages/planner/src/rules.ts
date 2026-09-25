import type { MatrixRule, PlannerEndpointInput } from "./types.js";

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
    description: "Probe for broken object level authorization on resource ID path parameters",
    matches: (endpoint) => isAuthRequired(endpoint) && hasIdInPath(endpoint),
  },
  {
    name: "mass_assignment_probe",
    category: "security",
    description: "Probe mutating endpoints for unintended property injection",
    matches: isMutatingWithBody,
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
];
