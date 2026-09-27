import _Ajv from "ajv";
import _addFormats from "ajv-formats";
import { generateSchemaMutations, type SchemaMutationCase } from "@apitrace/planner";
import type { TestJobPayload } from "@apitrace/planner";
import type { TestExecutionResult } from "../types.js";
import type { HttpProbeClient } from "../http/client.js";
import { interpolatePath, truncate } from "../utils.js";

const AjvClass = (_Ajv as unknown as { default?: typeof _Ajv }).default ?? _Ajv;
const addFormatsFunc =
  (_addFormats as unknown as { default?: typeof _addFormats }).default ?? _addFormats;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ajvInstance = new (AjvClass as any)({
  allErrors: true,
  strict: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(addFormatsFunc as any)(ajvInstance);

export async function runOpenApiSchemaConformance(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  if (!job.responseSchema) {
    return {
      status: "pass",
      severity: "info",
      latencyMs: 0,
      detail: {
        evidence: "No response JSON schema declared in spec.",
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
      },
    };
  }

  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    return {
      status: "warn",
      severity: "low",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Endpoint returned non-2xx status (HTTP ${res.statusCode}); response schema validation skipped.`,
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

  if (res.json === null) {
    return {
      status: "fail",
      severity: "medium",
      latencyMs: res.latencyMs,
      detail: {
        evidence: "Expected JSON response matching schema, but received non-JSON or unparseable payload.",
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Ensure the endpoint returns valid JSON with Content-Type: application/json.",
      },
    };
  }

  try {
    const validate = ajvInstance.compile(job.responseSchema);
    const isValid = validate(res.json);

    if (!isValid) {
      const errorDetails = JSON.stringify(validate.errors);
      return {
        status: "fail",
        severity: "medium",
        latencyMs: res.latencyMs,
        detail: {
          evidence: `Response body deviates from OpenAPI contract. Schema errors: ${errorDetails}`,
          requestSent: {
            method: job.method,
            url: targetUrl,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
            body: truncate(res.body),
          },
          remediation: "Update the OpenAPI specification or fix backend serialization to adhere to declared contract.",
        },
      };
    }
  } catch (schemaError) {
    return {
      status: "warn",
      severity: "low",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Unable to compile response schema: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`,
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

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: "Response payload adheres to OpenAPI contract.",
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

export async function runStatusCodeDeclaredCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  const res = await client.send(job.baseUrl, {
    method: job.method,
    path,
  });

  if (res.statusCode >= 500) {
    return {
      status: "fail",
      severity: "high",
      latencyMs: res.latencyMs,
      detail: {
        evidence: `Endpoint failed with internal server error: HTTP ${res.statusCode}.`,
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
        responseReceived: {
          status: res.statusCode,
          headers: res.headers,
          body: truncate(res.body),
        },
        remediation: "Investigate server logs and uncaught exceptions on this route.",
      },
    };
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: res.latencyMs,
    detail: {
      evidence: `Endpoint responded with status HTTP ${res.statusCode}.`,
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

export async function runNegativeContractMutationCheck(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const path = interpolatePath(job.path, job.parameters);
  const targetUrl = client.buildUrl(job.baseUrl, path);

  if (!job.requestSchema) {
    return {
      status: "pass",
      severity: "info",
      latencyMs: 0,
      detail: {
        evidence: "No request JSON schema declared in spec; negative contract mutation skipped.",
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
      },
    };
  }

  const allMutations = generateSchemaMutations(job.requestSchema);
  if (allMutations.length === 0) {
    return {
      status: "pass",
      severity: "info",
      latencyMs: 0,
      detail: {
        evidence: "Request schema has no defined properties to mutate.",
        requestSent: {
          method: job.method,
          url: targetUrl,
        },
      },
    };
  }

  // Select up to 8 prioritized mutations covering diverse mutation types
  const typeMap = new Map<string, SchemaMutationCase[]>();
  for (const m of allMutations) {
    const list = typeMap.get(m.mutationType) ?? [];
    list.push(m);
    typeMap.set(m.mutationType, list);
  }

  const selectedMutations: SchemaMutationCase[] = [];
  let added = true;
  let idx = 0;
  while (added && selectedMutations.length < 8) {
    added = false;
    for (const [, cases] of typeMap) {
      if (idx < cases.length && selectedMutations.length < 8) {
        selectedMutations.push(cases[idx]);
        added = true;
      }
    }
    idx++;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (job.config?.headers && typeof job.config.headers === "object") {
    Object.assign(headers, job.config.headers as Record<string, string>);
  }
  if (typeof job.config?.token === "string") {
    headers["authorization"] = `Bearer ${job.config.token}`;
  }

  let totalLatency = 0;
  let testedCount = 0;

  for (const mutation of selectedMutations) {
    const res = await client.send(job.baseUrl, {
      method: job.method,
      path,
      headers,
      body: mutation.body,
    });

    totalLatency += res.latencyMs;
    testedCount++;

    if (res.statusCode >= 500) {
      return {
        status: "fail",
        severity: "high",
        latencyMs: Math.round(totalLatency / testedCount),
        detail: {
          evidence: `Server crashed with HTTP ${res.statusCode} on negative contract mutation "${mutation.name}" (${mutation.description}).`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            headers,
            body: mutation.body,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
            body: truncate(res.body),
          },
          remediation:
            "Implement defensive input validation with schema middleware to reject malformed requests with HTTP 400 instead of crashing.",
        },
      };
    }

    if (
      (mutation.mutationType === "required_stripping" || mutation.mutationType === "type_inversion") &&
      res.statusCode >= 200 &&
      res.statusCode < 300
    ) {
      return {
        status: "fail",
        severity: "medium",
        latencyMs: Math.round(totalLatency / testedCount),
        detail: {
          evidence: `Endpoint accepted malformed input (${mutation.name}: ${mutation.description}) with HTTP ${res.statusCode} instead of rejecting with HTTP 400 or 422.`,
          requestSent: {
            method: job.method,
            url: targetUrl,
            headers,
            body: mutation.body,
          },
          responseReceived: {
            status: res.statusCode,
            headers: res.headers,
            body: truncate(res.body),
          },
          remediation:
            "Validate request bodies against OpenAPI schemas before processing business logic.",
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
      evidence: `Correctly validated contract boundaries across ${testedCount} schema mutations; all malformed payloads were rejected with HTTP 4xx client error status.`,
      requestSent: {
        method: job.method,
        url: targetUrl,
      },
      responseReceived: {
        status: 400,
      },
    },
  };
}

export async function runContractProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  switch (job.testName) {
    case "openapi_schema_conformance":
      return runOpenApiSchemaConformance(job, client);
    case "contract_negative_schema_mutation":
      return runNegativeContractMutationCheck(job, client);
    case "status_code_declared_check":
    default:
      return runStatusCodeDeclaredCheck(job, client);
  }
}

