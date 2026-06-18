import { postMessage } from "./vscode";
import type {
  AgentInfo,
  AgentRunRequest,
  AgentSession,
  BuildJob,
  BuildRequest,
  GatewayHealth,
  OrchestratorHealth,
  TasteEdge,
  TasteFeedbackPayload,
  TasteNode,
  TasteQueryResult,
} from "../../../src/services/types";

export type { AgentInfo, AgentSession, BuildJob, BuildRequest, GatewayHealth, OrchestratorHealth, TasteEdge, TasteNode, TasteQueryResult };

export async function gatewayHealth(): Promise<GatewayHealth> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "GET",
    path: "/health",
  })) as GatewayHealth;
}

export async function orchestratorHealth(): Promise<OrchestratorHealth> {
  return (await postMessage({
    type: "orchestratorRequest",
    method: "GET",
    path: "/health",
  })) as OrchestratorHealth;
}

export async function createBuild(projectId: string, request: BuildRequest): Promise<BuildJob> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "POST",
    path: `/projects/${encodeURIComponent(projectId)}/builds`,
    body: request,
  })) as BuildJob;
}

export async function getBuild(projectId: string, buildId: string): Promise<BuildJob> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "GET",
    path: `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}`,
  })) as BuildJob;
}

export async function approveBuild(
  projectId: string,
  buildId: string,
  projectRevision: number
): Promise<BuildJob> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "POST",
    path: `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/approve`,
    body: { projectRevision, cloudApproved: false },
  })) as BuildJob;
}

export async function rejectBuild(projectId: string, buildId: string): Promise<BuildJob> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "POST",
    path: `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/reject`,
    body: {},
  })) as BuildJob;
}

export async function cancelBuild(projectId: string, buildId: string): Promise<BuildJob> {
  return (await postMessage({
    type: "gatewayRequest",
    method: "POST",
    path: `/projects/${encodeURIComponent(projectId)}/builds/${encodeURIComponent(buildId)}/cancel`,
    body: {},
  })) as BuildJob;
}

export async function listAgents(): Promise<AgentInfo[]> {
  return (await postMessage({
    type: "orchestratorRequest",
    method: "GET",
    path: "/agents",
  })) as AgentInfo[];
}

export async function runAgent(request: AgentRunRequest): Promise<AgentSession> {
  return (await postMessage({
    type: "orchestratorRequest",
    method: "POST",
    path: "/agents/run",
    body: request,
  })) as AgentSession;
}

export async function queryTaste(projectId: string, intent: string, topK = 3): Promise<TasteQueryResult> {
  return (await postMessage({
    type: "orchestratorRequest",
    method: "POST",
    path: "/taste/query",
    body: { project_id: projectId, intent, top_k: topK },
  })) as TasteQueryResult;
}

export async function sendTasteFeedback(payload: TasteFeedbackPayload): Promise<{ nodeId: string }> {
  const result = (await postMessage({
    type: "orchestratorRequest",
    method: "POST",
    path: "/taste/feedback",
    body: {
      project_id: payload.projectId,
      clip_id: payload.clipId,
      verdict: payload.verdict,
      label: payload.label,
      feature_vector: payload.featureVector,
      tags: payload.tags,
      metadata: payload.metadata,
    },
  })) as { status: string; node_id: string };
  return { nodeId: result.node_id };
}

export async function getTasteGraph(projectId: string): Promise<{ nodes: TasteNode[]; edges: TasteEdge[] }> {
  const result = (await postMessage({
    type: "orchestratorRequest",
    method: "GET",
    path: `/taste/${encodeURIComponent(projectId)}`,
  })) as { status: string; nodes: TasteNode[]; edges: TasteEdge[] };
  return { nodes: result.nodes, edges: result.edges };
}

export async function showSaveDialog(options: {
  defaultUri?: string;
  saveLabel?: string;
  filters?: Record<string, string[]>;
}): Promise<string | undefined> {
  return (await postMessage({ type: "showSaveDialog", options })) as string | undefined;
}

export async function showOpenDialog(options: {
  defaultUri?: string;
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  filters?: Record<string, string[]>;
}): Promise<string[] | undefined> {
  return (await postMessage({ type: "showOpenDialog", options })) as string[] | undefined;
}

export async function readFile(uri: string): Promise<Uint8Array> {
  const data = (await postMessage({ type: "readFile", uri })) as number[];
  return new Uint8Array(data);
}

export async function writeFile(uri: string, data: Uint8Array): Promise<boolean> {
  return (await postMessage({ type: "writeFile", uri, data: Array.from(data) })) as boolean;
}

export async function revealFileInOS(uri: string): Promise<boolean> {
  return (await postMessage({ type: "revealFileInOS", uri })) as boolean;
}

export async function getWorkspaceFolder(): Promise<string | undefined> {
  return (await postMessage({ type: "getWorkspaceFolder" })) as string | undefined;
}

export async function executeCommand(command: string, args?: unknown[]): Promise<unknown> {
  return postMessage({ type: "executeCommand", command, args });
}

export async function subscribeProjectEvents(projectId: string): Promise<void> {
  await postMessage({ type: "subscribeProjectEvents", projectId });
}

export async function unsubscribeProjectEvents(): Promise<void> {
  await postMessage({ type: "unsubscribeProjectEvents" });
}

export async function exportAudio(request: {
  projectId: string;
  targetUri: string;
  clips: Record<string, unknown>[];
  tracks: Record<string, unknown>[];
  bpm: number;
  preset: string;
  outputMode: "master" | "master_and_stems";
}): Promise<void> {
  await postMessage({ type: "exportAudio", ...request });
}
