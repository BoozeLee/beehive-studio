/**
 * Beehive Studio Core Data Models — TypeScript Definitions
 * 
 * Single source of truth (mirrored in Python Pydantic).
 * These models are used by both the desktop frontend and (via serialization)
 * the agent orchestrator service.
 * 
 * All timestamps are Unix epoch seconds (number) unless otherwise noted.
 * All IDs are UUID v4 strings.
 */

export type ID = string;

// ============================================
// Core Musical Domain
// ============================================

export interface TimeSignature {
  numerator: number;   // e.g. 4
  denominator: number; // e.g. 4
}

export interface TempoAutomationPoint {
  time: number;   // beats from start of clip/arrangement
  bpm: number;
}

export interface ClipMetadata {
  generative: boolean;
  proposed?: boolean;        // Agent proposal awaiting human Accept/Reject; absent/false = committed
  agentId?: ID;
  promptId?: ID;
  sourcePatternId?: ID;
  reasoningTrace?: string;   // Human-readable explanation from agent
  confidence?: number;       // 0-1
  referenceIds?: ID[];       // Links to Reference used
  tags?: string[];
}

export interface MidiNote {
  pitch: number;      // MIDI note number (0-127)
  velocity: number;   // 0-127
  start: number;      // beats from clip start
  duration: number;   // beats
}

export interface MidiClipData {
  notes: MidiNote[];
  controlChanges?: Array<{
    time: number;
    controller: number;
    value: number;
  }>;
  tempoAutomation?: TempoAutomationPoint[];
}

export type ClipType = 'midi' | 'audio' | 'generative' | 'group';

export interface Clip {
  id: ID;
  name: string;
  type: ClipType;
  trackId: ID;
  start: number;      // beat position in arrangement / session
  duration: number;   // in beats
  loop: boolean;
  color?: string;

  // Content
  midiData?: MidiClipData;
  audioFilePath?: string;   // relative or absolute local path
  audioSourceOffset?: number; // seconds from source start
  audioSourceDuration?: number; // seconds available from source
  gain?: number; // 0-2 clip gain
  warpStretchFactor?: number; // 0.5-2.0 time-stretch (1 = off); >1 = faster
  fadeInBeats?: number;  // linear fade-in length in beats
  fadeOutBeats?: number; // linear fade-out length in beats
  generativePrompt?: string;

  // Lightweight playback hint for MVP Tone.js scheduling (Sprint 1+)
  // Full instrument details live on Track for richer sessions.
  playback?: {
    instrument: 'synth' | 'bass' | 'pad' | 'sample' | 'drum';
    preset?: string;
  };

  metadata: ClipMetadata;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Tracks & Arrangement
// ============================================

export type TrackType = 'midi' | 'audio' | 'group' | 'return' | 'master';

export interface AutomationLane {
  id: ID;
  parameter: string;           // e.g. "volume", "filter.cutoff", "send.reverb"
  points: Array<{ time: number; value: number }>;
  mode?: 'off' | 'read' | 'touch' | 'write';
}

export type TrackEffectType = 'reverb' | 'delay' | 'filter' | 'distortion';

export interface TrackEffect {
  id: ID;
  type: TrackEffectType;
  params: Record<string, number>;
  bypass: boolean;
}

export interface Track {
  id: ID;
  name: string;
  type: TrackType;
  color: string;
  volume: number;              // 0-1 linear
  pan: number;                 // -1 to 1
  muted: boolean;
  solo: boolean;
  arm: boolean;                // record arm

  parentGroupId?: ID;
  clips: ID[];                 // ordered list of clip ids belonging to this track

  automationLanes: AutomationLane[];
  effects?: TrackEffect[];
  sends?: Record<string, number>;

  // For MIDI tracks
  instrument?: {
    type: 'tonejs' | 'sample' | 'external'; // external = future VST placeholder
    preset?: string;
    settings?: Record<string, unknown>;
  };
}

// ============================================
// Session (the root creative container)
// ============================================

export interface SessionSettings {
  bpm: number;
  timeSignature: TimeSignature;
  grooveTemplateId?: ID;
  swing: number; // 0-1
  masterVolume: number;
}

export interface Session {
  id: ID;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;

  settings: SessionSettings;

  tracks: Track[];
  clips: Record<ID, Clip>;   // map for fast lookup

  // Agent collaboration state
  activeAgentTasks: ID[];
  agentHistory: AgentTask[];

  // Beehive Studio context
  referenceIds: ID[];

  // Versioning for undo/branching
  version: number;
  parentSessionId?: ID;
}

// ============================================
// Agents & Tasks
// ============================================

export type AgentRole =
  | 'orchestrator'
  | 'narrative_concept'
  | 'rhythm_groove'
  | 'harmony_melody_bass'
  | 'texture_atmosphere_fx'
  | 'arrangement_structure'
  | 'mixing_mastering'
  | 'style_reference';

export interface Agent {
  id: ID;
  role: AgentRole;
  name: string;           // e.g. "ÆNIMAL Rhythmist"
  description: string;
  systemPromptVersion: string;
  enabled: boolean;
  temperature?: number;
  model?: string;         // which Ollama model or NIM deployment
}

export type AgentTaskStatus = 
  | 'queued' 
  | 'running' 
  | 'awaiting_human' 
  | 'completed' 
  | 'failed' 
  | 'rejected' 
  | 'overridden';

export interface AgentTask {
  id: ID;
  sessionId: ID;
  agentId: ID;
  role: AgentRole;

  brief: string;                    // The instruction this task was given
  contextSnapshot: Record<string, unknown>; // Relevant slice of session + Beehive Studio refs at start

  status: AgentTaskStatus;
  startedAt?: number;
  completedAt?: number;

  outputClipIds: ID[];              // Clips this task created or modified
  reasoning: string[];              // Step-by-step trace shown to user
  alternativesConsidered?: string[];

  error?: string;
  humanFeedback?: string;           // What the user said when iterating/rejecting

  parentTaskId?: ID;                // For iteration trees
}

export interface AgentAttribution {
  service: string;
  model: string;
  profile: string;
  promptVersions: Record<string, string>;
  latencyMs: number;
}

export interface AgentProposalEnvelope {
  status: string;
  degraded: boolean;
  attribution: AgentAttribution;
  creativePlan: {
    summary?: string;
    rationale?: string[];
    confidence?: Record<string, number>;
    alternatives?: Array<{
      direction: string;
      why: string;
      delta_summary?: string;
    }>;
    warnings?: string[];
    evidence?: string[];
    recommended_parameters?: Record<string, number>;
  };
}

// ============================================
// JetBee Build Contracts
// ============================================

export type ArtifactOwner = "dsl" | "visual";
export type CompilerPreference = "auto" | "ace-rest" | "ace-cpp" | "deapi-rest" | "deapi-mcp";
export type BuildStatus =
  | "planning"
  | "awaiting_approval"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ArtifactSummary {
  id: ID;
  kind: "track" | "clip" | "pattern" | "arrangement" | "prompt" | "audio";
  owner: ArtifactOwner;
  revision: number;
  name: string;
  summary: string;
}

export interface JetBeeBuildRequest {
  projectId: string;
  projectRevision: number;
  intent: string;
  source: "keyboard" | "editor" | "agent" | "api";
  selectedArtifactIds: ID[];
  artifacts: ArtifactSummary[];
  compilerPreference: CompilerPreference;
  allowCloud: boolean;
  cloudApproved: boolean;
}

export interface PatchOperation {
  op: "set_parameter" | "add_artifact" | "replace_artifact" | "remove_artifact";
  artifactId: ID;
  path: string;
  value?: unknown;
}

export interface ProjectPatch {
  id: ID;
  operations: PatchOperation[];
  affectedArtifactIds: ID[];
  risk: "low" | "medium" | "high";
  rationale: string[];
}

export interface BuildStep {
  id: ID;
  kind: "patch" | "agent" | "qa" | "compile" | "ingest";
  label: string;
  agentRole?: string;
  provider?: string;
}

export interface BuildPlan {
  id: ID;
  summary: string;
  projectRevision: number;
  proposedPatches: ProjectPatch[];
  executionSteps: BuildStep[];
  warnings: string[];
  confidence: Record<string, number>;
  attribution: Record<string, unknown>;
  degraded: boolean;
}

export interface BuildArtifact {
  id: ID;
  kind: "audio" | "midi" | "manifest";
  path: string;
  provider: string;
  checksum: string;
  metadata: Record<string, unknown>;
}

export interface BuildJob {
  id: ID;
  projectId: string;
  plan: BuildPlan;
  status: BuildStatus;
  provider?: string;
  progress: number;
  artifacts: BuildArtifact[];
  error?: string;
}

export interface BuildEvent {
  type: string;
  projectId: string;
  buildId: string;
  sourceService: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

// ============================================
// Prompts & Versioning
// ============================================

export interface GenerationPrompt {
  id: ID;
  name: string;
  role: AgentRole;
  template: string;                 // The actual prompt text with {{variables}}
  version: number;
  createdAt: number;
  parentPromptId?: ID;              // For prompt evolution tracking
  tags?: string[];
}

// ============================================
// Beehive Studio Integration
// ============================================

export interface Reference {
  id: ID;
  type: 'artist' | 'ritual' | 'co_production' | 'track' | 'aesthetic' | 'custom';
  title: string;
  description?: string;
  tags: string[];
  // Serialized graph relationships (lightweight for now)
  relatedIds: ID[];
  attributes: Record<string, unknown>;   // tempo feel, harmonic language, ritual function, etc.
  lastUsedAt?: number;
}

// ============================================
// UI / Workspace State (desktop only)
// ============================================

export type WorkspaceMode = 'composition' | 'performance';

export interface WorkspaceState {
  currentSessionId: ID;
  mode: WorkspaceMode;
  selectedTrackId?: ID;
  selectedClipId?: ID;
  focusedAgentTaskId?: ID;
  transportPlaying: boolean;
  currentBeat: number;
  zoom: number;                     // for timeline/piano roll
}

// ============================================
// Taste Graph (self-evolving agent memory)
// ============================================

export type TasteNodeKind =
  | 'reference_track'
  | 'midi_motif'
  | 'groove_pattern'
  | 'sound_texture'
  | 'rejected_idea';

export type TasteEdgeKind =
  | 'sounds_like'
  | 'evolved_from'
  | 'rejected_because'
  | 'used_in'
  | 'inspired_by';

export interface TasteNode {
  id: ID;
  kind: TasteNodeKind;
  label: string;
  createdAt: number;
  projectId: string;
  sourceArtifactId?: ID;
  featureVector?: number[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface TasteEdge {
  id: ID;
  sourceId: ID;
  targetId: ID;
  kind: TasteEdgeKind;
  weight: number;
  updatedAt: number;
}

export interface TasteQueryResult {
  nodes: TasteNode[];
  summary: string;
}

export interface TasteFeedbackPayload {
  projectId: string;
  clipId: ID;
  verdict: 'like' | 'never_again';
  nodeKind?: TasteNodeKind;
  label?: string;
  featureVector?: number[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}
