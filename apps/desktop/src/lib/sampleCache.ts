import { invoke } from "@tauri-apps/api/core";
import * as Tone from "tone";

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
const players = new Map<string, any>();

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

export async function playSamplePreview(path: string): Promise<void> {
  if (players.has(path)) {
    players.get(path)!.start();
    return;
  }

  const player = new Tone.Player(path).toDestination();
  await Tone.loaded();
  players.set(path, player);
  player.start();
}

export function stopSamplePreview(path: string): void {
  const player = players.get(path);
  if (player) {
    player.stop();
  }
}

export function clearSampleCache(): void {
  sampleCache.clear();
  players.forEach((p) => p.dispose());
  players.clear();
}
