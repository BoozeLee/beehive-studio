import * as Tone from "tone";
import type { Clip, Track } from "./desktopTypes";
import { createChannel, getInputNode, removeChannel } from "./audioMixer";
import { readFile } from "./api";

export interface ScheduledNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export interface ScheduledClip {
  id: string;
  trackId: string;
  start: number;
  duration: number;
  notes: ScheduledNote[];
  audioFilePath?: string;
  audioSourceOffset?: number;
  gain?: number;
  loop?: boolean;
  instrument?: "drum" | "bass" | "pad" | "synth";
}

const parts = new Map<string, Tone.Part>();
const players = new Map<string, Tone.Player>();
const synths = new Map<string, Tone.PolySynth | Tone.Synth>();
const channelIds = new Set<string>();

function instrumentForTrack(track: Track): ScheduledClip["instrument"] {
  if (track.type === "audio") return "synth";
  const preset = track.instrument?.preset?.toLowerCase() ?? "";
  const name = track.name.toLowerCase();
  if (preset.includes("drum") || name.includes("kick") || name.includes("snare") || track.type === "drum") return "drum";
  if (preset.includes("pad") || name.includes("pad")) return "pad";
  if (preset.includes("bass") || name.includes("bass") || track.type === "bass") return "bass";
  return "synth";
}

function oscillatorType(instrument: ScheduledClip["instrument"]): OscillatorType {
  switch (instrument) {
    case "drum":
      return "sine";
    case "pad":
      return "triangle";
    case "bass":
      return "sawtooth";
    default:
      return "square";
  }
}

function getOrCreateSynth(trackId: string, instrument: ScheduledClip["instrument"]): Tone.PolySynth | Tone.Synth {
  const key = `${trackId}:${instrument}`;
  if (!synths.has(key)) {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: oscillatorType(instrument) },
      envelope: { attack: 0.003, decay: 0.08, sustain: 0.4, release: 0.35 },
    });
    const input = getInputNode(trackId);
    if (input) synth.connect(input);
    else synth.toDestination();
    synths.set(key, synth);
  }
  return synths.get(key)!;
}

function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

export async function scheduleArrangement(tracks: Track[], clips: Clip[], bpm: number): Promise<void> {
  clearArrangement();

  const hasSolo = tracks.some((t) => t.solo);
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  // Ensure mixer channels exist for every audible track.
  for (const track of tracks) {
    const audible = !hasSolo || track.solo;
    if (!audible) continue;
    if (!channelIds.has(track.id)) {
      createChannel(track.id, track.name);
      channelIds.add(track.id);
    }
  }

  for (const clip of clips) {
    const track = trackMap.get(clip.trackId);
    if (!track) continue;
    const audible = !track.muted && (!hasSolo || track.solo);
    if (!audible) continue;

    const spb = secondsPerBeat(bpm);
    const startSeconds = clip.start * spb;

    if (clip.audioFilePath) {
      try {
        const bytes = await readFile(clip.audioFilePath);
        const data = new Uint8Array(bytes);
        const blob = new Blob([data], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const player = new Tone.Player({
          url,
          loop: clip.loop,
          volume: Tone.gainToDb(Math.max(0.001, clip.gain ?? 1)),
        });
        const input = getInputNode(track.id);
        if (input) player.connect(input);
        else player.toDestination();
        await Tone.loaded();
        const offset = clip.audioSourceOffset ?? 0;
        const duration = clip.duration ? clip.duration * spb : undefined;
        player.sync().start(startSeconds, offset, duration);
        players.set(clip.id, player);
      } catch (err) {
        console.warn(`[audioScheduler] failed to load audio clip ${clip.id}:`, err);
      }
      continue;
    }

    const notes = clip.midiData?.notes ?? [];
    if (notes.length === 0) continue;

    const instrument = instrumentForTrack(track);
    const synth = getOrCreateSynth(track.id, instrument);

    const part = new Tone.Part(
      (time, note) => {
        const n = note as ScheduledNote;
        synth.triggerAttackRelease(
          Tone.Frequency(n.pitch, "midi").toNote(),
          Math.max(0.01, n.duration * spb),
          time,
          Math.max(0.1, n.velocity / 127)
        );
      },
      notes.map((n) => [startSeconds + n.start * spb, n])
    );

    if (clip.loop) {
      part.loop = true;
      const loopEnd = Math.max(...notes.map((n) => (n.start + n.duration) * spb));
      part.loopEnd = loopEnd;
    }

    part.start(startSeconds);
    parts.set(clip.id, part);
  }
}

export function clearArrangement(): void {
  parts.forEach((part) => {
    part.stop();
    part.dispose();
  });
  parts.clear();

  players.forEach((player) => {
    player.unsync();
    player.dispose();
  });
  players.clear();

  synths.forEach((synth) => synth.dispose());
  synths.clear();

  channelIds.forEach((id) => removeChannel(id));
  channelIds.clear();
}

export function playClipImmediate(clip: Clip, track: Track, bpm: number): void {
  const spb = secondsPerBeat(bpm);
  const now = Tone.now();
  const notes = clip.midiData?.notes ?? [];
  if (notes.length === 0) return;
  const instrument = instrumentForTrack(track);
  const synth = getOrCreateSynth(track.id, instrument);
  notes.forEach((n) => {
    synth.triggerAttackRelease(
      Tone.Frequency(n.pitch, "midi").toNote(),
      Math.max(0.01, n.duration * spb),
      now + n.start * spb,
      Math.max(0.1, n.velocity / 127)
    );
  });
}
