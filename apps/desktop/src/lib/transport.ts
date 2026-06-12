import * as Tone from "tone";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getInputNode } from "./audioMixer";
import { useState, useCallback, useRef, useEffect } from "react";

export interface TransportState {
  isPlaying: boolean;
  bpm: number;
  currentBeat: number;
  isReady: boolean;
}

export interface ScheduledClip {
  id: string;
  notes?: Array<{
    pitch: number;
    velocity: number;
    start: number;
    duration: number;
  }>;
  startBeat: number; // When this clip starts in the transport timeline
  loop: boolean;
  channel: number;
  channelId?: string;
  instrument?: "synth" | "bass" | "pad" | "sample" | "drum";
  audioFilePath?: string;
  sourceOffset?: number;
  duration?: number;
  gain?: number;
}

let transportInitialized = false;

export function initTransport(): void {
  if (transportInitialized) return;
  Tone.Transport.bpm.value = 142;
  Tone.Transport.timeSignature = [4, 4];
  transportInitialized = true;
}

export function useTransport() {
  const [state, setState] = useState<TransportState>({
    isPlaying: false,
    bpm: 142,
    currentBeat: 0,
    isReady: false,
  });

  const partsRef = useRef<Map<string, Tone.Part>>(new Map());
  const synthsRef = useRef<Map<string, Tone.Synth>>(new Map());
  const playersRef = useRef<Map<string, Tone.Player>>(new Map());
  const rafRef = useRef<number>(0);

  // Initialize on first use
  useEffect(() => {
    initTransport();
    setState((s) => ({ ...s, isReady: true }));

    // Animation frame loop for current beat display
    const updateLoop = () => {
      const beat = Tone.Transport.position
        .toString()
        .split(":")
        .map(Number)
        .reduce((acc, val, idx) => acc + val * [4, 1, 0.25][idx], 0);
      setState((s) => ({ ...s, currentBeat: beat }));
      rafRef.current = requestAnimationFrame(updateLoop);
    };
    rafRef.current = requestAnimationFrame(updateLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getOrCreateSynth = useCallback((
    channel: number,
    instrument: ScheduledClip["instrument"] = "synth",
    channelId?: string
  ) => {
    const key = `${channel}:${instrument}`;
    if (!synthsRef.current.has(key)) {
      const oscillator =
        instrument === "drum"
          ? "sine"
          : instrument === "pad"
          ? "triangle"
          : instrument === "bass" || channel === 0
          ? "sawtooth"
          : "square";
      const synth = new Tone.Synth({
        oscillator: { type: oscillator },
        envelope: { attack: 0.003, decay: 0.08, sustain: 0.4, release: 0.35 },
      });
      const input = channelId ? getInputNode(channelId) : undefined;
      if (input) synth.connect(input);
      else synth.toDestination();
      synthsRef.current.set(key, synth);
    }
    return synthsRef.current.get(key)!;
  }, []);

  const scheduleClip = useCallback(
    (clip: ScheduledClip) => {
      // Remove existing part for this clip if any
      const existing = partsRef.current.get(clip.id);
      if (existing) {
        existing.dispose();
      }

      if (clip.audioFilePath) {
        const existingPlayer = playersRef.current.get(clip.id);
        existingPlayer?.dispose();
        const source = clip.audioFilePath.startsWith("http")
          ? clip.audioFilePath
          : convertFileSrc(clip.audioFilePath);
        const player = new Tone.Player({
          url: source,
          loop: clip.loop,
          volume: Tone.gainToDb(Math.max(0.001, clip.gain ?? 1)),
        });
        const input = clip.channelId ? getInputNode(clip.channelId) : undefined;
        if (input) player.connect(input);
        else player.toDestination();
        player.sync().start(
          clip.startBeat * (60 / Tone.Transport.bpm.value),
          clip.sourceOffset ?? 0,
          clip.duration ? clip.duration * (60 / Tone.Transport.bpm.value) : undefined
        );
        playersRef.current.set(clip.id, player);
        return;
      }

      const notes = clip.notes ?? [];
      if (notes.length === 0) return;
      const synth = getOrCreateSynth(clip.channel, clip.instrument, clip.channelId);
      const part = new Tone.Part(
        (time, note) => {
          const n = note as NonNullable<ScheduledClip["notes"]>[number];
          synth.triggerAttackRelease(
            Tone.Frequency(n.pitch, "midi").toNote(),
            n.duration * (60 / Tone.Transport.bpm.value),
            time,
            Math.max(0.1, n.velocity / 127)
          );
        },
        notes.map((n) => [
          n.start * (60 / Tone.Transport.bpm.value),
          n,
        ])
      );

      part.start(clip.startBeat * (60 / Tone.Transport.bpm.value));
      if (clip.loop) {
        part.loop = true;
        part.loopEnd =
          Math.max(...notes.map((n) => n.start + n.duration)) *
          (60 / Tone.Transport.bpm.value);
      }

      partsRef.current.set(clip.id, part);
    },
    [getOrCreateSynth]
  );

  const unscheduleClip = useCallback((clipId: string) => {
    const part = partsRef.current.get(clipId);
    if (part) {
      part.stop();
      part.dispose();
      partsRef.current.delete(clipId);
    }
  }, []);

  const play = useCallback(async () => {
    await Tone.start();
    Tone.Transport.start();
    setState((s) => ({ ...s, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    Tone.Transport.pause();
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const stop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    setState((s) => ({ ...s, isPlaying: false, currentBeat: 0 }));
  }, []);

  const seek = useCallback((beat: number) => {
    const safeBeat = Math.max(0, beat);
    const bars = Math.floor(safeBeat / 4);
    const quarters = Math.floor(safeBeat % 4);
    const sixteenths = Math.round((safeBeat % 1) * 4);
    Tone.Transport.position = `${bars}:${quarters}:${sixteenths}`;
    setState((s) => ({ ...s, currentBeat: safeBeat }));
  }, []);

  const setBpm = useCallback((bpm: number) => {
    Tone.Transport.bpm.rampTo(bpm, 0.1);
    setState((s) => ({ ...s, bpm }));
  }, []);

  // Scene launch: quantize to next bar boundary
  const launchScene = useCallback(
    async (clips: ScheduledClip[]) => {
      await Tone.start();

      // Calculate next bar boundary
      const currentPos = Tone.Transport.position.toString();
      const [bars, ,] = currentPos.split(":").map(Number);

      // Schedule all clips to start at next bar
      clips.forEach((clip) => {
        const clipAtNextBar = { ...clip, startBeat: (bars + 1) * 4 };
        scheduleClip(clipAtNextBar);
      });

      // Start transport if not already playing
      if (!Tone.Transport.state.includes("started")) {
        Tone.Transport.start();
        setState((s) => ({ ...s, isPlaying: true }));
      }
    },
    [scheduleClip]
  );

  const launchClipImmediate = useCallback(
    async (clip: ScheduledClip) => {
      await Tone.start();
      scheduleClip(clip);
      if (!Tone.Transport.state.includes("started")) {
        Tone.Transport.start();
        setState((s) => ({ ...s, isPlaying: true }));
      }
    },
    [scheduleClip]
  );

  const clearAll = useCallback(() => {
    partsRef.current.forEach((part) => {
      part.stop();
      part.dispose();
    });
    partsRef.current.clear();
    playersRef.current.forEach((player) => {
      player.unsync();
      player.dispose();
    });
    playersRef.current.clear();
  }, []);

  return {
    ...state,
    play,
    pause,
    stop,
    seek,
    setBpm,
    scheduleClip,
    unscheduleClip,
    launchScene,
    launchClipImmediate,
    clearAll,
  };
}
