import { audioBufferToFlac } from "./flacEncoder";
import { profilerStart, profilerEnd } from "./profiler";
import { invoke } from "@tauri-apps/api/core";

export interface RenderNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export interface RenderClip {
  id: string;
  notes: RenderNote[];
  channel?: number;
}

export type ExportFormat = "wav" | "flac" | "mp3";

function midiToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export async function renderAudioBuffer(
  clips: RenderClip[],
  bpm: number,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
  profilerStart("render:offline");
  let totalBeats = 0;
  for (const clip of clips) {
    for (const note of clip.notes) {
      const end = note.start + note.duration;
      if (end > totalBeats) totalBeats = end;
    }
  }
  totalBeats = Math.max(totalBeats, 4);

  const durationSeconds = (totalBeats / (bpm / 60)) + 1;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * durationSeconds, sampleRate);
  const secondsPerBeat = 60 / bpm;

  for (const clip of clips) {
    for (const note of clip.notes) {
      const startTime = note.start * secondsPerBeat;
      const durTime = note.duration * secondsPerBeat;
      const freq = midiToFrequency(note.pitch);
      const velocity = Math.max(0.1, note.velocity / 127);
      const endTime = startTime + durTime + 0.1;

      const osc = offlineCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, startTime);

      const env = offlineCtx.createGain();
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(velocity, startTime + 0.003);
      env.gain.setValueAtTime(velocity, startTime + durTime - 0.005);
      env.gain.linearRampToValueAtTime(0, startTime + durTime);

      osc.connect(env);
      env.connect(offlineCtx.destination);
      osc.start(startTime);
      osc.stop(endTime);
    }
  }

  const result = await offlineCtx.startRendering();
  profilerEnd("render:offline");
  return result;
}

export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  const totalLength = 44 + dataLength;

  const wav = new ArrayBuffer(totalLength);
  const view = new DataView(wav);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

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
  format: ExportFormat = "wav"
): Promise<Uint8Array> {
  const buffer = await renderAudioBuffer(clips, bpm);
  if (format === "flac") {
    profilerStart("render:flac");
    const result = audioBufferToFlac(buffer);
    profilerEnd("render:flac");
    return result;
  }
  if (format === "mp3") {
    profilerStart("render:mp3");
    // Convert AudioBuffer to interleaved i16 PCM
    const numChannels = buffer.numberOfChannels;
    const numFrames = buffer.length;
    const interleaved: number[] = new Array(numFrames * numChannels);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < numFrames; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        interleaved[i * numChannels + ch] = Math.round(
          sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        );
      }
    }
    const result = await invoke<number[]>("encode_mp3", {
      sampleRate: buffer.sampleRate,
      channels: numChannels,
      samples: interleaved,
    });
    const resultBytes = Uint8Array.from(result);
    profilerEnd("render:mp3");
    return resultBytes;
  }
  profilerStart("render:wav");
  const result = audioBufferToWav(buffer);
  profilerEnd("render:wav");
  return result;
}

export async function exportTrackStems(
  tracks: Array<{ id: string; name: string; clips: RenderClip[] }>,
  bpm: number,
  format: ExportFormat = "wav"
): Promise<Array<{ name: string; data: Uint8Array }>> {
  const stems: Array<{ name: string; data: Uint8Array }> = [];

  for (const track of tracks) {
    if (track.clips.length === 0) continue;
    const buffer = await renderAudioBuffer(track.clips, bpm);
    const data = format === "flac" ? audioBufferToFlac(buffer) : audioBufferToWav(buffer);
    stems.push({ name: track.name, data });
  }

  return stems;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
