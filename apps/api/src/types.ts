import type { Endpoint, TestResultDetail } from "@apitrace/core";

export interface CreateTargetBody {
  name: string;
  baseUrl: string;
  specSource: string;
}

export interface TargetParams {
  id: string;
}

export interface TargetSummaryResponse {
  id: string;
  name: string;
  baseUrl: string;
  specSource: string;
  createdAt: string;
  updatedAt: string;
  endpointsCount: number;
}

export interface TargetDetailResponse {
  id: string;
  name: string;
  baseUrl: string;
  specSource: string;
  createdAt: string;
  updatedAt: string;
  endpoints: Endpoint[];
}

export interface DeleteTargetResponse {
  success: boolean;
  id: string;
}

export interface CreateTargetResponse {
  targetId: string;
  discoveredEndpointsCount: number;
}

export interface RunParams {
  id: string;
}

export interface CreateRunBody {
  categories?: Array<"security" | "performance" | "contract">;
  enabledTests?: string[];
  disabledTests?: string[];
  config?: Record<string, unknown>;
}

export interface CreateRunResponse {
  runId: string;
  totalTests: number;
  status: string;
}

export interface RunSummaryResponse {
  id: string;
  targetId: string;
  status: string;
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  warningTests: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RunResultResponse {
  id: string;
  runId: string;
  endpointId: string;
  category: string;
  testName: string;
  status: string;
  severity: string;
  latencyMs: number | null;
  detail: TestResultDetail;
  createdAt: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}
