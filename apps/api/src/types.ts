import type { Endpoint } from "@apitrace/core";

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

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}
