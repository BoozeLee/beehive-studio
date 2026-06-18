// Mirror of packages/core-models/index.ts types used by ported desktop components.
// This avoids depending on the workspace package from the webview bundle.

export type ID = string;

export type TrackType =
  | "audio"
  | "midi"
  | "drum"
  | "bass"
  | "synth"
  | "sampler"
  | "group"
  | "return"
  | "master";

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface TempoAutomationPoint {
  time: number;
  bpm: number;
}

export interface ClipMetadata {
  generative: boolean;
  agentId?: ID;
  promptId?: ID;
  promptText?: string;
  sessionId?: ID;
  sourcePatternId?: ID;
  reasoningTrace?: string;
  confidence?: number;
  referenceIds?: ID[];
  tags?: string[];
  qa?: { pass: boolean; score: number; warnings: string[] };
}

export interface MidiNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
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

export type ClipType = "midi" | "audio" | "generative" | "group";

export interface Clip {
  id: ID;
  name: string;
  type: ClipType;
  trackId: ID;
  start: number;
  duration: number;
  loop: boolean;
  color?: string;
  midiData?: MidiClipData;
  audioFilePath?: string;
  audioSourceOffset?: number;
  audioSourceDuration?: number;
  gain?: number;
  generativePrompt?: string;
  playback?: {
    synthType?: string;
    samplePath?: string;
    previewDuration?: number;
  };
  metadata?: ClipMetadata;
  createdAt?: number;
  updatedAt?: number;
}

export type TrackEffectType = "reverb" | "delay" | "filter" | "distortion";

export interface TrackEffect {
  id: ID;
  type: TrackEffectType;
  params: Record<string, number>;
  bypass: boolean;
}

export interface AutomationLane {
  id: ID;
  parameter: string;
  points: Array<{ time: number; value: number }>;
  mode?: "off" | "read" | "touch" | "write";
}

export interface Track {
  id: ID;
  name: string;
  type: TrackType;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  arm: boolean;
  parentGroupId?: ID;
  clips: ID[];
  automationLanes: AutomationLane[];
  effects?: TrackEffect[];
  sends?: Record<string, number>;
  instrument?: {
    type: "tonejs" | "sample" | "external";
    preset?: string;
    settings?: Record<string, unknown>;
  };
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
