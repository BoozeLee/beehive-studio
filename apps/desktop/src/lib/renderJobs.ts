import { invoke } from "@tauri-apps/api/core";
import type { MixerTrackState, RenderClip } from "./audioEngine";
import type { RenderPreset } from "./exportWorkflow";

export interface RenderJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  stage: string;
  engine: "python";
  master_path?: string;
  stem_paths?: string[];
  error?: string;
}

export async function createRenderJob(
  clips: RenderClip[],
  tracks: MixerTrackState[],
  bpm: number,
  preset: RenderPreset,
  outputMode: "master" | "master_and_stems"
): Promise<RenderJob> {
  return invoke<RenderJob>("backend_request", {
    method: "POST",
    endpoint: "render/jobs",
    body: { clips, tracks, bpm, preset, output_mode: outputMode },
  });
}

export async function getRenderJob(id: string): Promise<RenderJob> {
  return invoke<RenderJob>("backend_request", {
    method: "GET",
    endpoint: `render/jobs/${id}`,
    body: null,
  });
}

export async function cancelRenderJob(id: string): Promise<RenderJob> {
  return invoke<RenderJob>("backend_request", {
    method: "DELETE",
    endpoint: `render/jobs/${id}`,
    body: null,
  });
}

export async function waitForRenderJob(
  id: string,
  onProgress: (job: RenderJob) => void,
  intervalMs = 200
): Promise<RenderJob> {
  for (;;) {
    const job = await getRenderJob(id);
    onProgress(job);
    if (job.status === "completed") return job;
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error ?? `Render ${job.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
