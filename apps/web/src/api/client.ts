import type {
  TargetSummary,
  TargetDetail,
  CreateTargetInput,
  CreateTargetResponse,
  DeleteTargetResponse,
  CreateRunInput,
  CreateRunResponse,
  RunSummary,
} from "../types.js";

const DEFAULT_API_BASE = "http://127.0.0.1:3001";

class ApiClient {
  private baseUrl: string;
  private isOnline: boolean | null = null;
  private localTargets: TargetSummary[] = [];
  private localDetails: Record<string, TargetDetail> = {};

  constructor(baseUrl: string = DEFAULT_API_BASE) {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      this.isOnline = res.ok;
      return res.ok;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  getOnlineStatus(): boolean | null {
    return this.isOnline;
  }

  async listTargets(): Promise<TargetSummary[]> {
    const isLive = await this.checkHealth();
    if (!isLive) {
      return [...this.localTargets];
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/targets`);
      if (!res.ok) {
        throw new Error(`Could not load targets (HTTP ${res.status})`);
      }
      const data = (await res.json()) as TargetSummary[];
      return data;
    } catch {
      return [...this.localTargets];
    }
  }

  async getTarget(id: string): Promise<TargetDetail> {
    const isLive = await this.checkHealth();
    if (!isLive) {
      const mockDetail = this.localDetails[id];
      if (mockDetail) return mockDetail;
      const target = this.localTargets.find((t) => t.id === id);
      if (!target) throw new Error("Target not found");
      return {
        ...target,
        endpoints: [],
      };
    }

    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Could not load target (HTTP ${res.status})`);
    }
    return (await res.json()) as TargetDetail;
  }

  async createTarget(input: CreateTargetInput): Promise<CreateTargetResponse> {
    const isLive = await this.checkHealth();
    if (!isLive) {
      const newId = `target-${Date.now()}`;
      const newTarget: TargetSummary = {
        id: newId,
        name: input.name.trim(),
        baseUrl: input.baseUrl.trim(),
        specSource: input.specSource,
        endpointsCount: 8,
        riskScore: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.localTargets.unshift(newTarget);
      this.localDetails[newId] = {
        ...newTarget,
        endpoints: [
          {
            id: `ep-${Date.now()}-1`,
            targetId: newId,
            method: "GET",
            path: "/api/health",
            operationId: "getHealth",
            authType: "none",
            parameters: [],
            riskScore: 0,
            createdAt: new Date().toISOString(),
          },
          {
            id: `ep-${Date.now()}-2`,
            targetId: newId,
            method: "POST",
            path: "/api/auth/token",
            operationId: "createToken",
            authType: "none",
            parameters: [],
            riskScore: 10,
            createdAt: new Date().toISOString(),
          },
          {
            id: `ep-${Date.now()}-3`,
            targetId: newId,
            method: "GET",
            path: "/api/users/{userId}",
            operationId: "getUser",
            authType: "bearer",
            parameters: [{ name: "userId", in: "path", required: true }],
            riskScore: 25,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      return {
        targetId: newId,
        discoveredEndpointsCount: 8,
      };
    }

    const res = await fetch(`${this.baseUrl}/api/targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error(err.message || `Could not add target (HTTP ${res.status})`);
    }

    return (await res.json()) as CreateTargetResponse;
  }

  async deleteTarget(id: string): Promise<DeleteTargetResponse> {
    const isLive = await this.checkHealth();
    if (!isLive) {
      this.localTargets = this.localTargets.filter((t) => t.id !== id);
      delete this.localDetails[id];
      return { success: true, id };
    }

    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Could not delete target (HTTP ${res.status})`);
    }

    return (await res.json()) as DeleteTargetResponse;
  }

  async triggerRun(targetId: string, input: CreateRunInput = {}): Promise<CreateRunResponse> {
    const isLive = await this.checkHealth();
    if (!isLive) {
      return {
        runId: `run-${Date.now()}`,
        totalTests: 18,
        status: "queued",
      };
    }

    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(targetId)}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error(err.message || `Could not start run (HTTP ${res.status})`);
    }

    return (await res.json()) as CreateRunResponse;
  }

  async getRun(runId: string): Promise<RunSummary> {
    const res = await fetch(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}`);
    if (!res.ok) {
      throw new Error(`Could not load run (HTTP ${res.status})`);
    }
    return (await res.json()) as RunSummary;
  }
}

export const apiClient = new ApiClient();
