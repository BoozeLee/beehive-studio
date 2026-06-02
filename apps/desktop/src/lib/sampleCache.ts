import { invoke } from "@tauri-apps/api/core";

export interface SampleInfo {
  path: string;
  filename: string;
  sample_rate: number;
  channels: number;
  duration_secs: number;
  bits_per_sample: number;
}

export interface SampleData {
  info: SampleInfo;
  samples: number[];
}

const sampleCache = new Map<string, SampleInfo>();

export async function getSampleMeta(path: string): Promise<SampleInfo> {
  if (sampleCache.has(path)) {
    return sampleCache.get(path)!;
  }
  const info = await invoke<SampleInfo>("get_sample_info", { path });
  sampleCache.set(path, info);
  return info;
}

export async function loadSampleForPlayback(path: string): Promise<SampleData> {
  return invoke<SampleData>("load_sample", { path });
}

let previewAudioCtx: AudioContext | null = null;
let currentPreviewSource: AudioBufferSourceNode | null = null;

function getPreviewAudioContext(): AudioContext {
  if (!previewAudioCtx) {
    previewAudioCtx = new AudioContext();
  }
  return previewAudioCtx;
}

export async function playSamplePreview(path: string): Promise<void> {
  stopSamplePreview();

  const ctx = getPreviewAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const response = await fetch(`asset://localhost/${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load sample: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start(0);

  currentPreviewSource = source;
}

export function stopSamplePreview(): void {
  if (currentPreviewSource) {
    try {
      currentPreviewSource.stop();
    } catch {}
    currentPreviewSource.disconnect();
    currentPreviewSource = null;
  }
}

export function clearSampleCache(): void {
  sampleCache.clear();
  stopSamplePreview();
  if (previewAudioCtx) {
    previewAudioCtx.close();
    previewAudioCtx = null;
  }
}
