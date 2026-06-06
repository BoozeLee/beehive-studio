import * as Tone from "tone";
import { invoke } from "@tauri-apps/api/core";
import { RENDER_PRESETS, type RenderPreset } from "./exportWorkflow";

export interface RenderNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export interface RenderClip {
  id: string;
  notes: RenderNote[];
  channel?: string | number;
  start?: number;
  audioFilePath?: string;
  sourceOffset?: number;
  duration?: number;
  gain?: number;
}

export interface MixerTrackState {
  id: string;
  name?: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  instrument?: "synth" | "bass" | "pad" | "drum";
  effects?: Array<{ id: string; type: string; params: Record<string, number>; bypass: boolean }>;
  sends?: Record<string, number>;
  automationLanes?: Array<{
    id: string;
    parameter: string;
    points: Array<{ time: number; value: number }>;
    mode?: string;
  }>;
}

export type { RenderPreset } from "./exportWorkflow";

export interface RenderProgress {
  progress: number;
  label: string;
}

export async function renderAudioBuffer(
  clips: RenderClip[],
  bpm: number,
  sampleRate: number = 44100,
  mixerTracks?: MixerTrackState[]
): Promise<AudioBuffer> {
  // Calculate total duration
  let totalBeats = 0;
  for (const clip of clips) {
    if (clip.audioFilePath) {
      totalBeats = Math.max(totalBeats, (clip.start ?? 0) + (clip.duration ?? 0));
    }
    for (const note of clip.notes) {
      const end = note.start + note.duration;
      if (end > totalBeats) totalBeats = end;
    }
  }
  totalBeats = Math.max(totalBeats, 4);

  const durationSeconds = (totalBeats / (bpm / 60)) + 1;

  const offline = new Tone.OfflineContext(2, durationSeconds, sampleRate);

  const hasSolo = mixerTracks?.some((t) => t.solo) ?? false;

  for (const clip of clips) {
    const track = mixerTracks?.find((t) => t.id === String(clip.channel ?? 0));
    if (hasSolo && track && !track.solo) continue;
    if (track && track.muted && !(hasSolo && track.solo)) continue;

    const inst = track?.instrument ?? (clip.channel === 0 ? "bass" : "synth");
    const oscType =
      inst === "drum"
        ? "sine"
        : inst === "pad"
        ? "triangle"
        : inst === "bass"
        ? "sawtooth"
        : "square";

    const synth = new Tone.Synth({
      oscillator: { type: oscType },
      envelope: { attack: 0.003, decay: 0.08, sustain: 0.4, release: 0.35 },
    });

    const pan = new Tone.Panner(track?.pan ?? 0);
    const gain = new Tone.Gain(track?.volume ?? 0.8);

    synth.chain(pan, gain, offline.destination);

    const now = offline.currentTime;

    for (const note of clip.notes) {
      const startTime = (note.start / (bpm / 60)) + now;
      const durTime = note.duration / (bpm / 60);
      const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
      synth.triggerAttackRelease(freq, durTime, startTime, Math.max(0.1, note.velocity / 127));
    }

    // Schedule disposal after all notes finish
    synth.triggerRelease(offline.currentTime + durationSeconds);
  }

  const toneBuffer = await offline.render();
  const rendered = toneBuffer.get() as AudioBuffer;
  return mixAudioClips(rendered, clips, bpm, mixerTracks);
}

async function mixAudioClips(
  buffer: AudioBuffer,
  clips: RenderClip[],
  bpm: number,
  mixerTracks?: MixerTrackState[]
): Promise<AudioBuffer> {
  const audioClips = clips.filter((clip) => clip.audioFilePath);
  if (audioClips.length === 0) return buffer;
  const hasSolo = mixerTracks?.some((track) => track.solo) ?? false;

  for (const clip of audioClips) {
    const track = mixerTracks?.find((item) => item.id === String(clip.channel ?? 0));
    if (track?.muted || (hasSolo && track && !track.solo)) continue;
    const data = await invoke<{
      info: { sample_rate: number; channels: number };
      samples: number[];
    }>("load_sample", { path: clip.audioFilePath }).catch(() => null);
    if (!data || data.samples.length === 0) continue;
    const sourceRate = data.info.sample_rate;
    const sourceChannels = Math.max(1, data.info.channels);
    const sourceOffset = Math.floor((clip.sourceOffset ?? 0) * sourceRate) * sourceChannels;
    const targetOffset = Math.floor(((clip.start ?? 0) / (bpm / 60)) * buffer.sampleRate);
    const maxFrames = Math.floor(((clip.duration ?? Infinity) / (bpm / 60)) * sourceRate);
    const gain = (clip.gain ?? 1) * (track?.volume ?? 0.8);
    const pan = track?.pan ?? 0;
    const leftGain = gain * (pan > 0 ? 1 - pan : 1);
    const rightGain = gain * (pan < 0 ? 1 + pan : 1);
    const availableFrames = Math.floor((data.samples.length - sourceOffset) / sourceChannels);
    const frames = Math.min(availableFrames, maxFrames);

    for (let frame = 0; frame < frames; frame++) {
      const target = targetOffset + Math.floor((frame / sourceRate) * buffer.sampleRate);
      if (target >= buffer.length) break;
      const source = sourceOffset + frame * sourceChannels;
      const left = data.samples[source] ?? 0;
      const right = sourceChannels > 1 ? data.samples[source + 1] ?? left : left;
      buffer.getChannelData(0)[target] = Math.max(
        -1,
        Math.min(1, buffer.getChannelData(0)[target] + left * leftGain)
      );
      if (buffer.numberOfChannels > 1) {
        buffer.getChannelData(1)[target] = Math.max(
          -1,
          Math.min(1, buffer.getChannelData(1)[target] + right * rightGain)
        );
      }
    }
  }
  return buffer;
}

function integratedLufs(buffer: AudioBuffer): number {
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      mono[i] += data[i];
    }
  }
  for (let i = 0; i < buffer.length; i++) {
    mono[i] /= buffer.numberOfChannels;
  }

  let sum = 0;
  for (let i = 0; i < mono.length; i++) {
    sum += mono[i] * mono[i];
  }
  const rms = Math.sqrt(sum / mono.length);
  if (rms <= 0) return -Infinity;
  return -0.691 + 20 * Math.log10(rms);
}

function normalizeBuffer(buffer: AudioBuffer, targetLufs: number): AudioBuffer {
  const currentLufs = integratedLufs(buffer);
  if (!isFinite(currentLufs)) return buffer;

  const gainDb = targetLufs - currentLufs;
  const gain = Math.pow(10, gainDb / 20);

  const out = new AudioContext().createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      dst[i] = Math.max(-1, Math.min(1, src[i] * gain));
    }
  }
  return out;
}

export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const bytesPerSample = bitsPerSample / 8;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const wav = new ArrayBuffer(totalLength);
  const view = new DataView(wav);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Interleave channels and write samples
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }

  return new Uint8Array(wav);
}

export async function exportProjectAudio(
  clips: RenderClip[],
  bpm: number,
  preset: RenderPreset = "festival",
  mixerTracks?: MixerTrackState[],
  onProgress?: (progress: RenderProgress) => void
): Promise<Uint8Array> {
  onProgress?.({ progress: 0.1, label: "Preparing arrangement" });
  await Promise.resolve();
  onProgress?.({ progress: 0.25, label: "Rendering tracks" });
  const buffer = await renderAudioBuffer(clips, bpm, 44100, mixerTracks);
  onProgress?.({ progress: 0.75, label: "Applying master preset" });
  const targetLufs = RENDER_PRESETS[preset].targetLufs;
  const normalized = normalizeBuffer(buffer, targetLufs);
  onProgress?.({ progress: 0.9, label: "Encoding WAV" });
  const wav = audioBufferToWav(normalized);
  onProgress?.({ progress: 1, label: "Export ready" });
  return wav;
}

export async function exportTrackStems(
  tracks: Array<{ id: string; name: string; clips: RenderClip[] }>,
  bpm: number
): Promise<Array<{ name: string; data: Uint8Array }>> {
  const stems: Array<{ name: string; data: Uint8Array }> = [];

  for (const track of tracks) {
    if (track.clips.length === 0) continue;
    const buffer = await renderAudioBuffer(track.clips, bpm);
    const wav = audioBufferToWav(buffer);
    stems.push({ name: track.name, data: wav });
  }

  return stems;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
