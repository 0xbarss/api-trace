import type { EndpointParameter, TargetAuthProfiles } from "@apitrace/core";

export type TestCategory = "security" | "performance" | "contract" | "workflow";

export interface TestJobPayload {
  runId: string;
  targetId: string;
  endpointId: string;
  baseUrl: string;
  method: string;
  path: string;
  authType: string;
  parameters: EndpointParameter[];
  requestSchema?: Record<string, unknown> | null;
  responseSchema?: Record<string, unknown> | null;
  category: TestCategory;
  testName: string;
  config?: Record<string, unknown>;
  scenario?: ScenarioDefinition;
}

export interface ScenarioStep {
  name: string;
  method: string;
  path: string;
  body?: Record<string, unknown>;
  expectedStatus?: number[];
  extract?: Record<string, string>;
}

export interface ScenarioDefinition {
  name: string;
  description: string;
  steps: ScenarioStep[];
}

export interface PlannerEndpointInput {
  id: string;
  targetId?: string;
  method: string;
  path: string;
  operationId?: string | null;
  authType?: string;
  parameters?: EndpointParameter[];
  requestSchema?: Record<string, unknown> | null;
  responseSchema?: Record<string, unknown> | null;
}

export interface TestPlanOptions {
  categories?: TestCategory[];
  enabledTests?: string[];
  disabledTests?: string[];
  config?: Record<string, unknown>;
  authProfiles?: TargetAuthProfiles;
}

export interface GeneratePlanParams {
  runId: string;
  targetId: string;
  baseUrl: string;
  endpoints: PlannerEndpointInput[];
  options?: TestPlanOptions;
}

export interface MatrixRule {
  name: string;
  category: TestCategory;
  description: string;
  matches: (endpoint: PlannerEndpointInput) => boolean;
  buildConfig?: (endpoint: PlannerEndpointInput, options?: TestPlanOptions) => Record<string, unknown> | undefined;
}

export interface SchemaMutationCase {
  name: string;
  description: string;
  mutationType:
    | "type_inversion"
    | "required_stripping"
    | "string_boundary"
    | "number_boundary"
    | "unexpected_property";
  body: Record<string, unknown>;
  targetField?: string;
}
