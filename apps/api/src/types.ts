import type { Endpoint, TestResultDetail, TargetAuthProfiles } from "@apitrace/core";

export interface CreateTargetBody {
  name: string;
  baseUrl: string;
  specSource: string;
  authProfiles?: TargetAuthProfiles;
}

export interface TargetAuthProfileSummary {
  name: string;
  hasToken: boolean;
}

export interface TargetAuthProfilesSummary {
  primary?: TargetAuthProfileSummary;
  secondary?: TargetAuthProfileSummary;
  unprivileged?: TargetAuthProfileSummary;
}

export type UpdateAuthProfilesBody = TargetAuthProfiles;

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
  hasAuthProfiles: boolean;
}

export interface TargetDetailResponse {
  id: string;
  name: string;
  baseUrl: string;
  specSource: string;
  createdAt: string;
  updatedAt: string;
  endpoints: Endpoint[];
  authProfiles: TargetAuthProfilesSummary;
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

export type WebSocketEventType =
  | "CONNECTED"
  | "TEST_COMPLETED"
  | "RUN_STARTED"
  | "RUN_PROGRESS"
  | "RUN_COMPLETED"
  | "ERROR"
  | "PONG";

export interface WebSocketRunEvent {
  type: WebSocketEventType | string;
  runId?: string;
  status?: string;
  endpointId?: string;
  result?: unknown;
  completedTests?: number;
  totalTests?: number;
  message?: string;
  error?: string;
  timestamp?: string;
  [key: string]: unknown;
}

