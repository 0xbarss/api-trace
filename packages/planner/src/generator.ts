import { buildAuthProfileConfig, matrixRules } from "./rules.js";
import { generateCrudLifecycleScenarios } from "./scenarios.js";
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

export function generateScenarioJobs(
  runId: string,
  targetId: string,
  baseUrl: string,
  endpoints: PlannerEndpointInput[],
  options?: TestPlanOptions
): TestJobPayload[] {
  if (options?.categories && !options.categories.includes("workflow")) {
    return [];
  }

  const scenarios = generateCrudLifecycleScenarios(endpoints);
  const jobs: TestJobPayload[] = [];

  for (const scenario of scenarios) {
    if (options?.enabledTests && !options.enabledTests.includes(scenario.name)) {
      continue;
    }
    if (options?.disabledTests && options.disabledTests.includes(scenario.name)) {
      continue;
    }

    const originEndpoint = endpoints.find((e) => e.path === scenario.steps[0]?.path);

    jobs.push({
      runId,
      targetId,
      endpointId: originEndpoint?.id ?? "",
      baseUrl,
      method: scenario.steps[0]?.method ?? "POST",
      path: scenario.steps[0]?.path ?? "",
      authType: originEndpoint?.authType?.trim() || "none",
      parameters: originEndpoint?.parameters ?? [],
      requestSchema: originEndpoint?.requestSchema ?? null,
      responseSchema: originEndpoint?.responseSchema ?? null,
      category: "workflow",
      testName: scenario.name,
      config: buildAuthProfileConfig(options),
      scenario,
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

  allJobs.push(...generateScenarioJobs(runId, targetId, baseUrl, endpoints, options));

  return allJobs;
}
