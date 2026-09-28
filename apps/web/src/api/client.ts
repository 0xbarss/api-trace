import type {
  TargetSummary,
  TargetDetail,
  CreateTargetInput,
  CreateTargetResponse,
  DeleteTargetResponse,
  AuthProfilesInput,
  AuthProfilesSummary,
  CreateRunInput,
  CreateRunResponse,
  RunSummary,
  TestFinding,
  WebSocketRunEvent,
} from "../types.js";

const DEFAULT_API_BASE = "http://127.0.0.1:3001";

class ApiClient {
  private baseUrl: string;
  private isOnline: boolean | null = null;

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
      const timeoutId = setTimeout(() => controller.abort(), 2000);
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
    const res = await fetch(`${this.baseUrl}/api/targets`);
    if (!res.ok) {
      throw new Error(`Could not load targets (HTTP ${res.status})`);
    }
    return (await res.json()) as TargetSummary[];
  }

  async getTarget(id: string): Promise<TargetDetail> {
    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Could not load target (HTTP ${res.status})`);
    }
    return (await res.json()) as TargetDetail;
  }

  async createTarget(input: CreateTargetInput): Promise<CreateTargetResponse> {
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

  async updateAuthProfiles(id: string, profiles: AuthProfilesInput): Promise<AuthProfilesSummary> {
    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(id)}/auth-profiles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profiles),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error(err.message || `Could not save auth profiles (HTTP ${res.status})`);
    }

    return (await res.json()) as AuthProfilesSummary;
  }

  async deleteTarget(id: string): Promise<DeleteTargetResponse> {
    const res = await fetch(`${this.baseUrl}/api/targets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Could not delete target (HTTP ${res.status})`);
    }

    return (await res.json()) as DeleteTargetResponse;
  }

  async listRuns(targetId?: string): Promise<RunSummary[]> {
    const url = targetId
      ? `${this.baseUrl}/api/runs?targetId=${encodeURIComponent(targetId)}`
      : `${this.baseUrl}/api/runs`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Could not load runs (HTTP ${res.status})`);
    }
    return (await res.json()) as RunSummary[];
  }

  async triggerRun(targetId: string, input: CreateRunInput = {}): Promise<CreateRunResponse> {
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

  async getRunResults(runId: string): Promise<TestFinding[]> {
    const res = await fetch(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/results`);
    if (!res.ok) {
      throw new Error(`Could not load run results (HTTP ${res.status})`);
    }
    return (await res.json()) as TestFinding[];
  }

  subscribeRunStream(
    runId: string,
    onEvent: (ev: WebSocketRunEvent) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const wsProtocol = this.baseUrl.startsWith("https") ? "wss:" : "ws:";
    const host = this.baseUrl.replace(/^https?:\/\//, "");
    const ws = new WebSocket(`${wsProtocol}//${host}/api/runs/${encodeURIComponent(runId)}/stream`);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as WebSocketRunEvent;
        onEvent(parsed);
      } catch (e) {
        console.error("Failed to parse websocket message:", e);
      }
    };

    if (onError) {
      ws.onerror = (e) => onError(e);
    }

    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "PING" }));
      }
    }, 15000);

    return () => {
      clearInterval(pingTimer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }
}

export const apiClient = new ApiClient();
