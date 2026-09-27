export interface EndpointParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema?: Record<string, unknown>;
}

export interface EndpointSummary {
  id: string;
  targetId: string;
  method: string;
  path: string;
  operationId?: string | null;
  authType: string;
  parameters: EndpointParameter[];
  requestSchema?: Record<string, unknown> | null;
  responseSchema?: Record<string, unknown> | null;
  riskScore: number;
  createdAt: string;
}

export interface TargetSummary {
  id: string;
  name: string;
  baseUrl: string;
  specSource: string;
  createdAt: string;
  updatedAt: string;
  endpointsCount: number;
  riskScore?: number;
}

export interface TargetDetail {
  id: string;
  name: string;
  baseUrl: string;
  specSource: string;
  createdAt: string;
  updatedAt: string;
  endpoints: EndpointSummary[];
}

export interface CreateTargetInput {
  name: string;
  baseUrl: string;
  specSource: string;
}

export interface CreateTargetResponse {
  targetId: string;
  discoveredEndpointsCount: number;
}

export interface DeleteTargetResponse {
  success: boolean;
  id: string;
}

export interface CreateRunInput {
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

export interface RunSummary {
  id: string;
  targetId: string;
  status: "queued" | "running" | "completed" | "failed";
  totalTests: number;
  completedTests: number;
  passedTests: number;
  failedTests: number;
  warningTests: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface TestFinding {
  id: string;
  runId: string;
  endpointId: string;
  category: "security" | "performance" | "contract";
  testName: string;
  status: "pass" | "warn" | "fail";
  severity: "critical" | "high" | "medium" | "low" | "info";
  latencyMs?: number | null;
  detail: {
    evidence: string;
    requestSent?: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    responseReceived?: {
      status: number;
      headers?: Record<string, string>;
      body?: unknown;
    };
    remediation?: string;
  };
  createdAt: string;
}

export interface WebSocketRunEvent {
  type: "CONNECTED" | "TEST_COMPLETED" | "RUN_COMPLETED" | "ERROR" | "PING" | "PONG";
  runId?: string;
  endpointId?: string;
  result?: TestFinding;
  status?: string;
  totalTests?: number;
  completedTests?: number;
  timestamp?: string;
  error?: string;
  message?: string;
}
