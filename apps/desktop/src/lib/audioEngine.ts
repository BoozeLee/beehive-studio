import * as Tone from "tone";

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

export interface MixerTrackState {
  id: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  instrument?: "synth" | "bass" | "pad" | "drum";
}

export type RenderPreset = "draft" | "club" | "festival";

const PRESET_TARGETS: Record<RenderPreset, number> = {
  draft: -14.0,
  club: -9.5,
  festival: -7.5,
};

export async function renderAudioBuffer(
  clips: RenderClip[],
  bpm: number,
  sampleRate: number = 44100,
  mixerTracks?: MixerTrackState[]
): Promise<AudioBuffer> {
  // Calculate total duration
  let totalBeats = 0;
  for (const clip of clips) {
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
  return toneBuffer.get() as AudioBuffer;
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
  mixerTracks?: MixerTrackState[]
): Promise<Uint8Array> {
  const buffer = await renderAudioBuffer(clips, bpm, 44100, mixerTracks);
  const targetLufs = PRESET_TARGETS[preset];
  const normalized = normalizeBuffer(buffer, targetLufs);
  return audioBufferToWav(normalized);
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
