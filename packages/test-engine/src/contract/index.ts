import _Ajv from "ajv";
import _addFormats from "ajv-formats";
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

export async function runContractProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  switch (job.testName) {
    case "openapi_schema_conformance":
      return runOpenApiSchemaConformance(job, client);
    case "status_code_declared_check":
    default:
      return runStatusCodeDeclaredCheck(job, client);
  }
}
