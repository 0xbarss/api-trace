export interface CreateTargetBody {
  name: string;
  baseUrl: string;
  specSource: string;
}

export interface TargetParams {
  id: string;
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

export interface CreateTargetResponse {
  targetId: string;
  discoveredEndpointsCount: number;
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
