import type { Clip as TimelineClip, ID, Track } from "../../../../packages/core-models/index";
import type { RenderClip, MixerTrackState } from "./audioEngine";
import type { ScheduledClip } from "./transport";
import type { PatternRecord } from "./patternBankStore";

export interface AppClip {
  id: ID;
  name: string;
  duration?: number;
  color?: string;
  midiData?: TimelineClip["midiData"];
  reasoning?: string[];
  qa?: { pass?: boolean; score?: number; warnings?: string[] };
  sourcePatternId?: ID;
  audioFilePath?: string;
  audioSourceOffset?: number;
  audioSourceDuration?: number;
  gain?: number;
}

export interface ProjectArtifactRecord {
  id: ID;
  kind: "track" | "clip" | "pattern" | "arrangement" | "prompt" | "audio";
  owner: "dsl" | "visual";
  revision: number;
  sourcePath?: string;
}

export interface ProjectDocumentV5 {
  version: 5;
  clips: AppClip[];
  timeline: {
    tracks: Track[];
    clips: Record<ID, TimelineClip>;
  };
  patterns: PatternRecord[];
  settings: {
    masterGain: number;
    renderEngine: "python" | "desktop" | "rust";
  };
  artifacts: Record<ID, ProjectArtifactRecord>;
  dslSources: Record<string, string>;
  buildConfiguration: {
    compilerPreference: "auto" | "ace-rest" | "ace-cpp" | "deapi-rest" | "deapi-mcp";
    allowCloud: boolean;
  };
}

export type ProjectDocumentV4 = ProjectDocumentV5;

export interface ArrangementPayload {
  renderClips: RenderClip[];
  mixerTracks: MixerTrackState[];
}

function isAudibleTrack(track: Track, hasSolo: boolean): boolean {
  if (hasSolo) return track.solo;
  return !track.muted;
}

function instrumentForTrack(track: Track): MixerTrackState["instrument"] {
  if (track.type === "audio") return "synth";
  const preset = track.instrument?.preset?.toLowerCase() ?? "";
  const name = track.name.toLowerCase();
  if (preset.includes("drum") || name.includes("kick") || name.includes("snare")) return "drum";
  if (preset.includes("pad") || name.includes("pad")) return "pad";
  if (preset.includes("bass") || name.includes("bass")) return "bass";
  return "synth";
}

function clipNotesWithinDuration(clip: TimelineClip): NonNullable<TimelineClip["midiData"]>["notes"] {
  const notes = clip.midiData?.notes ?? [];
  return notes
    .filter((note) => note.start < clip.duration)
    .map((note) => ({
      ...note,
      duration: Math.max(0.01, Math.min(note.duration, clip.duration - note.start)),
    }));
}

function sortedTimelineClips(tracks: Track[], clips: Record<ID, TimelineClip>): TimelineClip[] {
  const ordered: TimelineClip[] = [];
  const seen = new Set<ID>();

  for (const track of tracks) {
    for (const clipId of track.clips) {
      const clip = clips[clipId];
      if (clip && !seen.has(clipId)) {
        ordered.push(clip);
        seen.add(clipId);
      }
    }
  }

  for (const clip of Object.values(clips)) {
    if (!seen.has(clip.id)) ordered.push(clip);
  }

  return ordered.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

export function buildMixerTrackState(tracks: Track[]): MixerTrackState[] {
  return tracks.map((track) => ({
    id: String(track.id),
    name: track.name,
    volume: track.volume,
    pan: track.pan,
    muted: track.muted,
    solo: track.solo,
    instrument: instrumentForTrack(track),
    effects: track.effects,
    sends: track.sends,
    automationLanes: track.automationLanes,
  }));
}

export function buildArrangementRenderPayload(
  tracks: Track[],
  clips: Record<ID, TimelineClip>
): ArrangementPayload {
  const hasSolo = tracks.some((track) => track.solo);
  const trackMap = new Map(tracks.map((track) => [track.id, track]));
  const renderClips: RenderClip[] = [];

  for (const clip of sortedTimelineClips(tracks, clips)) {
    const track = trackMap.get(clip.trackId);
    if (!track || !isAudibleTrack(track, hasSolo)) continue;

    const notes = clipNotesWithinDuration(clip).map((note) => ({
      pitch: note.pitch,
      velocity: note.velocity,
      start: clip.start + note.start,
      duration: note.duration,
    }));
    if (notes.length === 0 && !clip.audioFilePath) continue;

    renderClips.push({
      id: clip.id,
      notes,
      channel: track.id,
      start: clip.start,
      audioFilePath: clip.audioFilePath,
      sourceOffset: clip.audioSourceOffset ?? 0,
      duration: clip.duration,
      gain: clip.gain ?? 1,
    });
  }

  return {
    renderClips,
    mixerTracks: buildMixerTrackState(tracks),
  };
}

export function buildArrangementMidiPayload(
  tracks: Track[],
  clips: Record<ID, TimelineClip>
): Array<{ id: ID; name: string; midiData: NonNullable<TimelineClip["midiData"]> }> {
  const notes = buildArrangementRenderPayload(tracks, clips).renderClips.flatMap((clip) => clip.notes);
  if (notes.length === 0) return [];
  return [{
    id: "arrangement",
    name: "Arrangement",
    midiData: {
      notes,
    },
  }];
}

export function buildArrangementPlaybackClips(
  tracks: Track[],
  clips: Record<ID, TimelineClip>
): ScheduledClip[] {
  const hasSolo = tracks.some((track) => track.solo);
  const trackMap = new Map(tracks.map((track, index) => [track.id, { track, index }]));
  const scheduled: ScheduledClip[] = [];

  for (const clip of sortedTimelineClips(tracks, clips)) {
    const entry = trackMap.get(clip.trackId);
    if (!entry || !isAudibleTrack(entry.track, hasSolo)) continue;

    const notes = clipNotesWithinDuration(clip);
    if (notes.length === 0 && !clip.audioFilePath) continue;

    scheduled.push({
      id: clip.id,
      notes,
      startBeat: clip.start,
      loop: clip.loop,
      channel: entry.index,
      channelId: String(entry.track.id),
      instrument: clip.playback?.instrument ?? instrumentForTrack(entry.track),
      audioFilePath: clip.audioFilePath,
      sourceOffset: clip.audioSourceOffset ?? 0,
      duration: clip.duration,
      gain: clip.gain ?? 1,
    });
  }

  return scheduled;
}

export function serializeProjectDocument(
  clips: AppClip[],
  tracks: Track[],
  timelineClips: Record<ID, TimelineClip>,
  patterns: PatternRecord[] = [],
  settings: ProjectDocumentV4["settings"] = { masterGain: 0.9, renderEngine: "python" }
): string {
  const artifacts: Record<ID, ProjectArtifactRecord> = {};
  for (const track of tracks) artifacts[track.id] = { id: track.id, kind: "track", owner: "visual", revision: 0 };
  for (const clip of Object.values(timelineClips)) {
    artifacts[clip.id] = { id: clip.id, kind: clip.type === "audio" ? "audio" : "clip", owner: "visual", revision: 0 };
  }
  for (const pattern of patterns) artifacts[pattern.id] = { id: pattern.id, kind: "pattern", owner: "visual", revision: 0 };
  const document: ProjectDocumentV5 = {
    version: 5,
    clips,
    timeline: {
      tracks,
      clips: timelineClips,
    },
    patterns,
    settings,
    artifacts,
    dslSources: {},
    buildConfiguration: { compilerPreference: "auto", allowCloud: false },
  };
  return JSON.stringify(document);
}

export function parseProjectDocument(raw: string | unknown): ProjectDocumentV5 {
  const parsed = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    ((parsed as { version?: unknown }).version === 2 ||
      (parsed as { version?: unknown }).version === 3 ||
      (parsed as { version?: unknown }).version === 4 ||
      (parsed as { version?: unknown }).version === 5)
  ) {
    const document = parsed as Partial<ProjectDocumentV5>;
    const tracks = document.timeline?.tracks ?? [];
    const timelineClips = document.timeline?.clips ?? {};
    const patterns = document.patterns ?? [];
    const artifacts = { ...(document.artifacts ?? {}) };
    for (const track of tracks) artifacts[track.id] ??= { id: track.id, kind: "track", owner: "visual", revision: 0 };
    for (const clip of Object.values(timelineClips)) {
      artifacts[clip.id] ??= { id: clip.id, kind: clip.type === "audio" ? "audio" : "clip", owner: "visual", revision: 0 };
    }
    for (const pattern of patterns) artifacts[pattern.id] ??= { id: pattern.id, kind: "pattern", owner: "visual", revision: 0 };
    return {
      version: 5,
      clips: document.clips ?? [],
      timeline: {
        tracks,
        clips: timelineClips,
      },
      patterns,
      settings: {
        masterGain: document.settings?.masterGain ?? 0.9,
        renderEngine: document.settings?.renderEngine ?? "python",
      },
      artifacts,
      dslSources: document.dslSources ?? {},
      buildConfiguration: {
        compilerPreference: document.buildConfiguration?.compilerPreference ?? "auto",
        allowCloud: document.buildConfiguration?.allowCloud ?? false,
      },
    };
  }

  return {
    version: 5,
    clips: Array.isArray(parsed) ? (parsed as AppClip[]) : [],
    timeline: {
      tracks: [],
      clips: {},
    },
    patterns: [],
    settings: { masterGain: 0.9, renderEngine: "python" },
    artifacts: {},
    dslSources: {},
    buildConfiguration: { compilerPreference: "auto", allowCloud: false },
  };
}
