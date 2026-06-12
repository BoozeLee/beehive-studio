import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  AgentInfo,
  AgentRunRequest,
  AgentSession,
  BuildEvent,
  BuildJob,
  BuildRequest,
  GatewayHealth,
  OrchestratorHealth,
  TasteFeedbackPayload,
  TasteQueryResult,
  TasteNode,
  TasteEdge,
} from "./types";

const DEFAULT_TIMEOUT = 30000;
const LONG_TIMEOUT = 300000;

class HttpClient {
  public client: AxiosInstance;

  constructor(baseURL: string, timeout: number = DEFAULT_TIMEOUT) {
    this.client = axios.create({
      baseURL,
      timeout,
      headers: { "Content-Type": "application/json" },
    });
  }

  protected async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(path, config);
    return response.data;
  }

  protected async post<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(path, body, config);
    return response.data;
  }

  protected async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(path, config);
    return response.data;
  }
}

export class GatewayClient extends HttpClient {
  constructor(baseURL: string) {
    super(baseURL, LONG_TIMEOUT);
  }

  async health(): Promise<GatewayHealth> {
    return this.get<GatewayHealth>("/health");
  }

  async getCapabilities(projectId: string): Promise<unknown> {
    return this.get(`/projects/${encodeURIComponent(projectId)}/capabilities`);
  }

  async createBuild(projectId: string, request: BuildRequest): Promise<BuildJob> {
    return this.post<BuildJob>(`/projects/${encodeURIComponent(projectId)}/builds`, request);
  }

  async getBuild(projectId: string, buildId: string): Promise<BuildJob> {
    return this.get<BuildJob>(`/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}`);
  }

  async approveBuild(projectId: string, buildId: string, projectRevision: number, cloudApproved = false): Promise<BuildJob> {
    return this.post<BuildJob>(
      `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/approve`,
      { projectRevision, cloudApproved }
    );
  }

  async rejectBuild(projectId: string, buildId: string): Promise<BuildJob> {
    return this.post<BuildJob>(
      `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/reject`,
      {}
    );
  }

  async cancelBuild(projectId: string, buildId: string): Promise<BuildJob> {
    return this.post<BuildJob>(
      `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/cancel`,
      {}
    );
  }

  async getHive999Health(): Promise<unknown> {
    return this.get("/hive999/health");
  }

  connectProjectEvents(projectId: string, onMessage: (event: BuildEvent) => void, onError?: (err: Event) => void): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:9000/projects/${encodeURIComponent(projectId)}/events`);
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as BuildEvent;
        onMessage(event);
      } catch {
        // ignore malformed events
      }
    };
    if (onError) {
      ws.onerror = onError;
    }
    return ws;
  }
}

export class OrchestratorClient extends HttpClient {
  constructor(baseURL: string) {
    super(baseURL, LONG_TIMEOUT);
  }

  async health(): Promise<OrchestratorHealth> {
    return this.get<OrchestratorHealth>("/health");
  }

  async listAgents(): Promise<AgentInfo[]> {
    return this.get<AgentInfo[]>("/agents");
  }

  async runAgent(request: AgentRunRequest): Promise<AgentSession> {
    return this.post<AgentSession>("/agents/run", request);
  }

  async queryTaste(projectId: string, intent: string, topK = 3): Promise<TasteQueryResult> {
    return this.post<TasteQueryResult>("/taste/query", {
      project_id: projectId,
      intent,
      top_k: topK,
    });
  }

  async sendTasteFeedback(payload: TasteFeedbackPayload): Promise<{ nodeId: string }> {
    const response = await this.post<{ status: string; node_id: string }>("/taste/feedback", {
      project_id: payload.projectId,
      clip_id: payload.clipId,
      verdict: payload.verdict,
      label: payload.label,
      feature_vector: payload.featureVector,
      tags: payload.tags,
      metadata: payload.metadata,
    });
    return { nodeId: response.node_id };
  }

  async getTasteGraph(projectId: string): Promise<{ nodes: TasteNode[]; edges: TasteEdge[] }> {
    return this.get<{ status: string; nodes: TasteNode[]; edges: TasteEdge[] }>(`/taste/${encodeURIComponent(projectId)}`);
  }
}

export class BackendClient {
  public gateway: GatewayClient;
  public orchestrator: OrchestratorClient;

  constructor(gatewayUrl: string, orchestratorUrl: string) {
    this.gateway = new GatewayClient(gatewayUrl);
    this.orchestrator = new OrchestratorClient(orchestratorUrl);
  }

  async gatewayHealth(): Promise<GatewayHealth> {
    return this.gateway.health();
  }

  async orchestratorHealth(): Promise<OrchestratorHealth> {
    return this.orchestrator.health();
  }
}
