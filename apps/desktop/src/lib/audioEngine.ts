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

export async function renderAudioBuffer(
  clips: RenderClip[],
  bpm: number,
  sampleRate: number = 44100
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

  const synth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.003, decay: 0.08, sustain: 0.4, release: 0.35 },
  }).connect(offline.destination);

  const now = offline.currentTime;

  for (const clip of clips) {
    for (const note of clip.notes) {
      const startTime = (note.start / (bpm / 60)) + now;
      const durTime = note.duration / (bpm / 60);
      const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
      synth.triggerAttackRelease(freq, durTime, startTime, Math.max(0.1, note.velocity / 127));
    }
  }

  const toneBuffer = await offline.render();
  synth.dispose();
  return toneBuffer.get() as AudioBuffer;
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
  bpm: number
): Promise<Uint8Array> {
  const buffer = await renderAudioBuffer(clips, bpm);
  return audioBufferToWav(buffer);
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
