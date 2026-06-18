export type RenderPreset = "draft" | "club" | "festival";

export interface RenderPresetDefinition {
  label: string;
  targetLufs: number;
  description: string;
}

export const RENDER_PRESETS: Record<RenderPreset, RenderPresetDefinition> = {
  draft: {
    label: "Draft",
    targetLufs: -14,
    description: "Fast, conservative preview master",
  },
  club: {
    label: "Club",
    targetLufs: -9.5,
    description: "Balanced loudness for club playback",
  },
  festival: {
    label: "Festival",
    targetLufs: -7.5,
    description: "Maximum-impact loudness target",
  },
};

export interface RenderSummary {
  clipCount: number;
  trackCount: number;
  noteCount: number;
  totalBeats: number;
  durationSeconds: number;
}

export interface RenderClip {
  id: string;
  notes: { pitch: number; velocity: number; start: number; duration: number }[];
  channel?: string;
  start: number;
  duration: number;
  audioFilePath?: string;
  sourceOffset?: number;
  gain?: number;
}

export function summarizeRender(clips: RenderClip[], bpm: number): RenderSummary {
  const channels = new Set<string>();
  let noteCount = 0;
  let totalBeats = 0;

  for (const clip of clips) {
    if (clip.channel !== undefined) channels.add(String(clip.channel));
    noteCount += clip.notes.length;
    for (const note of clip.notes) {
      totalBeats = Math.max(totalBeats, note.start + note.duration);
    }
  }

  totalBeats = Math.max(totalBeats, clips.length > 0 ? 4 : 0);
  return {
    clipCount: clips.length,
    trackCount: channels.size,
    noteCount,
    totalBeats,
    durationSeconds: bpm > 0 ? totalBeats / (bpm / 60) + (clips.length > 0 ? 1 : 0) : 0,
  };
}

export function formatRenderDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
