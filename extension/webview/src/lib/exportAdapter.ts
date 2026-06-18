import type { Clip, ID, Track } from "./desktopTypes";
import type { RenderClip } from "./exportWorkflow";

export interface MixerTrackState {
  id: string;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  instrument: "drum" | "bass" | "pad" | "synth";
  effects?: Track["effects"];
  sends?: Track["sends"];
  automationLanes?: Track["automationLanes"];
}

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

function clipNotesWithinDuration(clip: Clip): NonNullable<Clip["midiData"]>["notes"] {
  const notes = clip.midiData?.notes ?? [];
  return notes
    .filter((note) => note.start < clip.duration)
    .map((note) => ({
      ...note,
      duration: Math.max(0.01, Math.min(note.duration, clip.duration - note.start)),
    }));
}

function sortedTimelineClips(tracks: Track[], clips: Clip[]): Clip[] {
  const ordered: Clip[] = [];
  const seen = new Set<ID>();

  for (const track of tracks) {
    for (const clipId of track.clips) {
      const clip = clips.find((c) => c.id === clipId);
      if (clip && !seen.has(clipId)) {
        ordered.push(clip);
        seen.add(clipId);
      }
    }
  }

  for (const clip of clips) {
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

export function buildArrangementRenderPayload(tracks: Track[], clips: Clip[]): ArrangementPayload {
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
      channel: String(track.id),
      start: clip.start,
      duration: clip.duration,
      audioFilePath: clip.audioFilePath,
      sourceOffset: clip.audioSourceOffset ?? 0,
      gain: clip.gain ?? 1,
    });
  }

  return {
    renderClips,
    mixerTracks: buildMixerTrackState(tracks),
  };
}
