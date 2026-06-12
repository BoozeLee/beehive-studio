export interface ProviderHealth {
  provider: string;
  ready: boolean;
  local: boolean;
  detail: string;
}

export interface GatewayHealth {
  status: string;
  version: string;
  providers: ProviderHealth[];
  hive999: {
    status: string;
    service: string;
    model: string;
    model_ready: boolean;
    detail: string;
  };
}

export interface OrchestratorHealth {
  status: string;
  service: string;
  version: string;
  ollama_available: boolean;
  lupa_available: boolean;
}

export interface ArtifactSummary {
  id: string;
  kind: "track" | "clip" | "pattern" | "arrangement" | "prompt" | "audio";
  owner: "dsl" | "visual";
  revision: number;
  name?: string;
  summary?: string;
}

export interface BuildRequest {
  projectId: string;
  projectRevision: number;
  intent: string;
  source?: "keyboard" | "editor" | "agent" | "api";
  selectedArtifactIds?: string[];
  artifacts?: ArtifactSummary[];
  compilerPreference?: "auto" | "beehive-local" | "ace-rest" | "ace-cpp" | "deapi-rest" | "deapi-mcp";
  allowCloud?: boolean;
  cloudApproved?: boolean;
}

export interface BuildStep {
  id: string;
  kind: "patch" | "agent" | "qa" | "compile" | "ingest";
  label: string;
  agentRole?: string | null;
  provider?: string | null;
}

export interface BuildPlan {
  id: string;
  summary: string;
  projectRevision: number;
  proposedPatches: unknown[];
  executionSteps: BuildStep[];
  warnings: string[];
  confidence: Record<string, number>;
  attribution: Record<string, unknown>;
  degraded: boolean;
}

export interface BuildArtifact {
  id: string;
  kind: "audio" | "midi" | "manifest";
  path: string;
  provider: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface BuildJob {
  id: string;
  projectId: string;
  plan: BuildPlan;
  status: "planning" | "awaiting_approval" | "queued" | "running" | "completed" | "failed" | "cancelled";
  provider?: string | null;
  progress: number;
  artifacts: BuildArtifact[];
  error?: string | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
}

export interface AgentArtifact {
  id: string;
  kind: "midi" | "audio" | "pattern" | "patch";
  label: string;
  data: unknown;
  accepted: boolean;
}

export interface AgentSession {
  id: string;
  projectId: string;
  agent: string;
  brief: string;
  status: "running" | "completed" | "failed";
  reasoning: string[];
  artifacts: AgentArtifact[];
  createdAt: number;
  completedAt?: number;
}

export interface AgentRunRequest {
  agent: string;
  brief: string;
  projectId: string;
  context?: Record<string, unknown>;
}

export interface TasteNode {
  id: string;
  kind: "reference_track" | "midi_motif" | "groove_pattern" | "sound_texture" | "rejected_idea";
  label: string;
  createdAt: number;
  projectId: string;
  sourceArtifactId?: string;
  featureVector?: number[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface TasteEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "sounds_like" | "evolved_from" | "rejected_because" | "used_in" | "inspired_by";
  weight: number;
  updatedAt: number;
}

export interface TasteFeedbackPayload {
  projectId: string;
  clipId: string;
  verdict: "like" | "never_again";
  label?: string;
  featureVector?: number[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface TasteQueryResult {
  nodes: TasteNode[];
  summary: string;
}

export interface BuildEvent {
  type: string;
  projectId: string;
  buildId: string;
  sourceService: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface CreativeBranch {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  headCommit: string;
  status: "draft" | "proposed" | "merged" | "rejected";
  affectedClipIds: string[];
  agentAttribution?: {
    agent: string;
    brief: string;
  };
}

export interface MidiClipData {
  notes: Array<{
    pitch: number;
    velocity: number;
    start: number;
    duration: number;
  }>;
}

export interface TimelineClip {
  id: string;
  name: string;
  trackId: string;
  startBeat: number;
  durationBeats: number;
  kind: "midi" | "audio" | "pattern";
  midiData?: MidiClipData;
  audioFilePath?: string;
  color?: string;
  muted: boolean;
  metadata: Record<string, unknown>;
}
