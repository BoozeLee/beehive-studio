import { invoke } from "@tauri-apps/api/core";

let initialized = false;
let pendingInit: Promise<boolean> | null = null;

/**
 * Maps Track string IDs → CPAL engine usize indices.
 * CPAL uses sequential indices; we need stable mapping across sync calls.
 */
const trackIndexMap = new Map<string, number>();

export function isCpalAvailable(): boolean {
  return !!(window as unknown as Record<string, unknown>).__TAURI__;
}

export async function initCpalEngine(): Promise<boolean> {
  if (initialized) return true;
  if (pendingInit) return pendingInit;

  if (!isCpalAvailable()) {
    console.warn("cpalBridge: not in Tauri context, skipping CPAL init");
    return false;
  }

  pendingInit = (async () => {
    try {
      await invoke("audio_engine_init");
      initialized = true;
      console.log("cpalBridge: CPAL engine initialized");
      return true;
    } catch (err) {
      console.warn("cpalBridge: init failed (headless or no audio device):", err);
      return false;
    }
  })();

  return pendingInit;
}

export async function addCpalTrack(trackId: string): Promise<number | null> {
  if (!initialized) return null;
  if (trackIndexMap.has(trackId)) return trackIndexMap.get(trackId)!;

  try {
    const index = await invoke<number>("audio_engine_add_track");
    trackIndexMap.set(trackId, index);
    return index;
  } catch (err) {
    console.warn("cpalBridge: addTrack failed:", err);
    return null;
  }
}

export function getCpalTrackIndex(trackId: string): number | undefined {
  return trackIndexMap.get(trackId);
}

export async function syncCpalMixer(
  trackId: string,
  update: { volume?: number; pan?: number; muted?: boolean }
): Promise<void> {
  if (!initialized) return;

  const index = trackIndexMap.get(trackId);
  if (index === undefined) return;

  try {
    if (update.volume !== undefined) {
      await invoke("audio_engine_set_gain", { track: index, gain: clampUnit(update.volume) });
    }
    if (update.pan !== undefined) {
      await invoke("audio_engine_set_pan", { track: index, pan: clampPan(update.pan) });
    }
    if (update.muted !== undefined) {
      // CPAL Mixer uses gain=0 for mute
      await invoke("audio_engine_set_gain", {
        track: index,
        gain: update.muted ? 0.0 : clampUnit(1.0),
      });
    }
  } catch {
    // CPAL engine may not be available — this is non-critical
  }
}

export async function removeCpalTrack(trackId: string): Promise<void> {
  if (!initialized) return;
  trackIndexMap.delete(trackId);
}

export async function syncAllCpalTracks(
  tracks: Array<{ id: string; volume: number; pan: number; muted: boolean }>
): Promise<void> {
  if (!initialized) return;

  // Ensure all current tracks exist in CPAL
  for (const track of tracks) {
    if (!trackIndexMap.has(track.id)) {
      await addCpalTrack(track.id);
    }
    await syncCpalMixer(track.id, {
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
    });
  }

  // Clean up removed tracks from map
  const currentIds = new Set(tracks.map((t) => t.id));
  for (const [id] of trackIndexMap) {
    if (!currentIds.has(id)) {
      trackIndexMap.delete(id);
    }
  }
}

/**
 * Render the current arrangement through the CPAL engine for preview.
 * Returns stereo f32 interleaved samples, or null if CPAL is unavailable.
 */
export async function renderPreviewViaCpal(
  tracks: Array<{ id: string; volume: number; pan: number; muted: boolean }>,
  clips: Array<{
    trackId: string;
    audioFilePath?: string;
    start: number;
    duration: number;
    gain: number;
  }>,
  bpm: number
): Promise<Float32Array | null> {
  if (!initialized) {
    console.warn("cpalBridge: CPAL not initialized");
    return null;
  }

  try {
    const samples = await invoke<number[]>("render_preview_via_cpal", {
      tracks: tracks.map((t) => ({
        id: t.id,
        volume: t.volume,
        pan: t.pan,
        muted: t.muted || false,
      })),
      clips: clips.map((c) => ({
        trackId: c.trackId,
        audio_file_path: c.audioFilePath || "",
        start: c.start,
        duration: c.duration,
        gain: c.gain ?? 1.0,
      })),
      bpm,
    });

    return new Float32Array(samples);
  } catch (err) {
    console.warn("cpalBridge: renderPreview failed:", err);
    return null;
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPan(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}
