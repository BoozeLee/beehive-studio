import { invoke } from "@tauri-apps/api/core";
import type { MixerTrackState, RenderClip } from "./audioEngine";
import type { RenderPreset } from "./exportWorkflow";

export interface RustRenderResult {
  master_path: string;
  stem_paths: string[];
  engine: "rust";
}

/**
 * Render the arrangement with the native Rust offline engine. Writes master
 * (+ stems) to a temp dir and returns the paths (same shape the Python render
 * job exposes), so the export flow can read + save them.
 */
export async function renderOffline(
  clips: RenderClip[],
  tracks: MixerTrackState[],
  bpm: number,
  preset: RenderPreset,
  format: "wav" | "flac",
  outputMode: "master" | "master_and_stems"
): Promise<RustRenderResult> {
  return invoke<RustRenderResult>("render_offline", {
    clips,
    tracks,
    bpm,
    preset,
    format,
    output_mode: outputMode,
  });
}
