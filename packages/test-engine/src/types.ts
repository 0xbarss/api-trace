import type { TestResultDetail } from "@apitrace/core";
import type { TestJobPayload, TestCategory } from "@apitrace/planner";

export type TestExecutionStatus = "pass" | "fail" | "warn" | "error";

export type TestSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface TestExecutionResult {
  status: TestExecutionStatus;
  severity: TestSeverity;
  latencyMs: number;
  detail: TestResultDetail;
}

export interface ProbeRequestOptions {
  method?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: string | Record<string, unknown> | unknown[];
  timeoutMs?: number;
}

export interface ProbeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: unknown | null;
  latencyMs: number;
}

export interface ProbeEngineOptions {
  timeoutMs?: number;
  maxRetries?: number;
  customHeaders?: Record<string, string>;
  connections?: number;
  pipelining?: number;
}

export type TestRunner = (
  job: TestJobPayload,
  options?: ProbeEngineOptions
) => Promise<TestExecutionResult>;

export interface RegisteredRunner {
  name: string;
  category: TestCategory;
  description: string;
  run: TestRunner;
}
