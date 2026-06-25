import { invoke } from "@tauri-apps/api/core";

/**
 * Opt-in flag: drive playback with the native Rust realtime engine instead of
 * Tone.js. Off by default — enable in DevTools with
 * `localStorage.setItem("beehive.rustTransport","1")` (reload) or build with
 * `VITE_RUST_TRANSPORT=1`. The Tone.js path stays the default until the Rust
 * engine is verified live.
 */
export function rustTransportEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("beehive.rustTransport") === "1") {
      return true;
    }
  } catch {
    /* no localStorage (SSR/test) */
  }
  try {
    return (import.meta as { env?: Record<string, string> }).env?.VITE_RUST_TRANSPORT === "1";
  } catch {
    return false;
  }
}

export interface RtScheduleClip {
  notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>;
  startBeat: number;
  channel: number;
  instrument?: string;
  gain?: number;
  pan?: number;
}

/** Thin wrappers over the Rust transport Tauri commands. */
export const rt = {
  init: () => invoke<string>("realtime_init"),
  play: () => invoke("transport_play"),
  pause: () => invoke("transport_pause"),
  stop: () => invoke("transport_stop"),
  seek: (beat: number) => invoke("transport_seek", { beat }),
  setBpm: (bpm: number) => invoke("transport_set_bpm", { bpm }),
  clear: () => invoke("transport_clear_clips"),
  currentBeat: () => invoke<number>("transport_current_beat"),
  scheduleClip: (clip: RtScheduleClip) => invoke("transport_schedule_clip", { clip }),
};
