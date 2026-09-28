import type { TargetAuthProfiles } from "@apitrace/core";
import type { TestJobPayload, ScenarioStep } from "@apitrace/planner";
import { HttpProbeClient } from "../http/client.js";
import { buildAuthHeaders, truncate } from "../utils.js";
import { resolveJsonPath } from "./jsonpath.js";
import type { TestExecutionResult } from "../types.js";

function interpolateWithState(text: string, state: Record<string, unknown>): string {
  return text.replace(/\{([^}]+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      return String(state[key]);
    }
    return match;
  });
}

function interpolateBody(
  body: Record<string, unknown> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!body) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    result[key] = typeof value === "string" ? interpolateWithState(value, state) : value;
  }
  return result;
}

export async function runScenarioProbe(
  job: TestJobPayload,
  client: HttpProbeClient
): Promise<TestExecutionResult> {
  const scenario = job.scenario;
  if (!scenario || scenario.steps.length === 0) {
    return {
      status: "error",
      severity: "low",
      latencyMs: 0,
      detail: { evidence: `Scenario "${job.testName}" has no steps defined.` },
    };
  }

  const authProfiles = job.config?.authProfiles as TargetAuthProfiles | undefined;
  const headers = authProfiles?.primary ? buildAuthHeaders(authProfiles.primary) : undefined;
  const state: Record<string, unknown> = {};
  const stepLog: string[] = [];
  let totalLatencyMs = 0;

  for (const step of scenario.steps) {
    const result = await runStep(job.baseUrl, step, state, client, headers);
    totalLatencyMs += result.latencyMs;

    if (step.expectedStatus && !step.expectedStatus.includes(result.statusCode)) {
      stepLog.push(
        `${step.name}: expected status in [${step.expectedStatus.join(", ")}], got ${result.statusCode}`
      );
      return {
        status: "fail",
        severity: "high",
        latencyMs: totalLatencyMs,
        detail: {
          evidence: `Scenario "${scenario.name}" broke at step "${step.name}": ${stepLog[stepLog.length - 1]}. Steps so far: ${stepLog.join(" | ")}`,
          requestSent: { method: step.method, url: `${job.baseUrl}${interpolateWithState(step.path, state)}` },
          responseReceived: { status: result.statusCode, body: truncate(result.body, 500) },
        },
      };
    }

    stepLog.push(`${step.name}: ${result.statusCode}`);

    if (step.extract) {
      for (const [variable, path] of Object.entries(step.extract)) {
        const value = resolveJsonPath(result.json, path);
        if (value === undefined) {
          return {
            status: "warn",
            severity: "medium",
            latencyMs: totalLatencyMs,
            detail: {
              evidence: `Scenario "${scenario.name}" could not extract "${variable}" via "${path}" from step "${step.name}"'s response. Steps so far: ${stepLog.join(" | ")}`,
              responseReceived: { status: result.statusCode, body: truncate(result.body, 500) },
            },
          };
        }
        state[variable] = value;
      }
    }
  }

  return {
    status: "pass",
    severity: "info",
    latencyMs: totalLatencyMs,
    detail: {
      evidence: `Scenario "${scenario.name}" completed all ${scenario.steps.length} steps as expected: ${stepLog.join(" | ")}`,
    },
  };
}

async function runStep(
  baseUrl: string,
  step: ScenarioStep,
  state: Record<string, unknown>,
  client: HttpProbeClient,
  headers?: Record<string, string>
) {
  const path = interpolateWithState(step.path, state);
  const body = interpolateBody(step.body, state);
  return client.send(baseUrl, {
    method: step.method,
    path,
    body,
    headers,
  });
}
