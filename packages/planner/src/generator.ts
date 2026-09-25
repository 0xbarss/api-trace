import { matrixRules } from "./rules.js";
import type {
  GeneratePlanParams,
  PlannerEndpointInput,
  TestJobPayload,
  TestPlanOptions,
} from "./types.js";

export function generateEndpointJobs(
  runId: string,
  targetId: string,
  baseUrl: string,
  endpoint: PlannerEndpointInput,
  options?: TestPlanOptions
): TestJobPayload[] {
  if (!endpoint.id || !endpoint.method || !endpoint.path) {
    throw new Error("Endpoint must have id, method, and path defined");
  }

  const normalizedMethod = endpoint.method.toUpperCase();
  const normalizedAuth = endpoint.authType?.trim() || "none";
  const parameters = endpoint.parameters ?? [];
  const requestSchema = endpoint.requestSchema ?? null;
  const responseSchema = endpoint.responseSchema ?? null;

  const normalizedEndpoint: PlannerEndpointInput = {
    ...endpoint,
    method: normalizedMethod,
    authType: normalizedAuth,
    parameters,
    requestSchema,
    responseSchema,
  };

  const jobs: TestJobPayload[] = [];

  for (const rule of matrixRules) {
    if (options?.categories && !options.categories.includes(rule.category)) {
      continue;
    }

    if (options?.enabledTests && !options.enabledTests.includes(rule.name)) {
      continue;
    }

    if (options?.disabledTests && options.disabledTests.includes(rule.name)) {
      continue;
    }

    if (!rule.matches(normalizedEndpoint)) {
      continue;
    }

    const ruleConfig = rule.buildConfig?.(normalizedEndpoint, options);
    const jobConfig = ruleConfig ?? (options?.config ? { ...options.config } : undefined);

    jobs.push({
      runId,
      targetId,
      endpointId: endpoint.id,
      baseUrl,
      method: normalizedMethod,
      path: endpoint.path,
      authType: normalizedAuth,
      parameters,
      requestSchema,
      responseSchema,
      category: rule.category,
      testName: rule.name,
      config: jobConfig,
    });
  }

  return jobs;
}

export function generateTestPlan(params: GeneratePlanParams): TestJobPayload[] {
  const { runId, targetId, baseUrl, endpoints, options } = params;
  const allJobs: TestJobPayload[] = [];

  for (const endpoint of endpoints) {
    const endpointJobs = generateEndpointJobs(runId, targetId, baseUrl, endpoint, options);
    allJobs.push(...endpointJobs);
  }

  return allJobs;
}
