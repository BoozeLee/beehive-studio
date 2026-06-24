import type { Clip as TimelineClip, ID, Track } from "../../../../packages/core-models/index";

export interface GeneratedClip {
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

export function inferClipDuration(clip: GeneratedClip): number {
  if (typeof clip.duration === "number" && Number.isFinite(clip.duration) && clip.duration > 0) {
    return clip.duration;
  }

  const notes = clip.midiData?.notes ?? [];
  if (notes.length > 0) {
    return Math.max(...notes.map((note) => note.start + note.duration), 1);
  }

  return 4;
}

/**
 * Snap a beat position to the nearest bar boundary so proposed clips land
 * musically (Ableton-style) instead of at an arbitrary cursor offset.
 */
export function quantizeToBar(beat: number, beatsPerBar = 4): number {
  if (!Number.isFinite(beat) || beat <= 0 || beatsPerBar <= 0) return 0;
  return Math.round(beat / beatsPerBar) * beatsPerBar;
}

function inferPlaybackInstrument(clip: GeneratedClip): NonNullable<TimelineClip["playback"]>["instrument"] {
  const name = clip.name.toLowerCase();
  if (name.includes("drum") || name.includes("kick") || name.includes("snare")) return "drum";
  if (name.includes("bass")) return "bass";
  if (name.includes("pad") || name.includes("texture")) return "pad";
  if (!clip.midiData) return "sample";
  return "synth";
}

export function normalizeTimelineClip(
  clip: GeneratedClip,
  trackId: ID,
  index: number,
  existing?: TimelineClip
): TimelineClip {
  const now = Date.now() / 1000;
  const reasoningTrace = clip.reasoning?.join("\n");
  const tags = clip.qa?.warnings?.length ? ["qa-warning"] : [];

  return {
    id: clip.id,
    name: clip.name,
    type: clip.midiData ? "midi" : "audio",
    trackId,
    start: existing?.start ?? index * 4,
    duration: existing?.duration ?? inferClipDuration(clip),
    loop: existing?.loop ?? false,
    color: clip.color,
    midiData: clip.midiData,
    audioFilePath: clip.audioFilePath ?? existing?.audioFilePath,
    audioSourceOffset: clip.audioSourceOffset ?? existing?.audioSourceOffset ?? 0,
    audioSourceDuration: clip.audioSourceDuration ?? existing?.audioSourceDuration,
    gain: clip.gain ?? existing?.gain ?? 1,
    playback: {
      instrument: inferPlaybackInstrument(clip),
      preset: existing?.playback?.preset,
    },
    metadata: {
      generative: Boolean(clip.reasoning?.length || clip.qa),
      reasoningTrace,
      confidence: typeof clip.qa?.score === "number" ? clip.qa.score / 100 : undefined,
      tags,
      sourcePatternId: clip.sourcePatternId,
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function findTrackIdForClip(tracks: Track[], clipId: ID): ID | undefined {
  return tracks.find((track) => track.clips.includes(clipId))?.id;
}

export function assignClipIdsToTracks(
  tracks: Track[],
  clipIds: ID[],
  fallbackTrackId: ID
): Record<ID, ID[]> {
  const activeClipIds = new Set(clipIds);
  const assigned = new Set<ID>();
  const next: Record<ID, ID[]> = {};

  for (const track of tracks) {
    const retained = track.clips.filter((clipId) => activeClipIds.has(clipId));
    next[track.id] = retained;
    for (const clipId of retained) assigned.add(clipId);
  }

  const fallback = next[fallbackTrackId] ?? [];
  for (const clipId of clipIds) {
    if (!assigned.has(clipId)) {
      fallback.push(clipId);
      assigned.add(clipId);
    }
  }
  next[fallbackTrackId] = fallback;

  return next;
}
