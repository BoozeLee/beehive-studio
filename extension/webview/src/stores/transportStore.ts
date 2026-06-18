import { create } from "zustand";
import * as Tone from "tone";
import type { BeehiveProject, Track } from "./projectStore";
import { useProjectStore } from "./projectStore";
import { useAppStore } from "./appStore";
import { initMixer } from "../lib/audioMixer";
import { scheduleArrangement, clearArrangement } from "../lib/audioScheduler";
import {
  startAudioRecording,
  stopAudioRecording,
  startMidiRecording,
  stopMidiRecording,
  type RecordingType,
} from "../lib/recordingEngine";
import type { Clip } from "../lib/desktopTypes";
import { writeFile } from "../lib/api";

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

interface TransportState {
  playing: boolean;
  isReady: boolean;
  bpm: number;
  currentBeat: number;
  timeSignature: TimeSignature;
  isRecording: boolean;
  recordEnabled: boolean;
  recordingType: RecordingType | null;
  recordStartBeat: number;
  recordStartTimeSeconds: number;
  isLooping: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;

  setBpm: (bpm: number) => void;
  syncToProject: (project: BeehiveProject | null) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  toggle: () => Promise<void>;
  seekToStart: () => void;
  seekToBeat: (beat: number) => void;
  toggleLoop: () => void;
  setLoopRegion: (start: number, end: number) => void;
  toggleMetronome: () => void;
  toggleRecordArm: () => void;
  setCurrentBeat: (beat: number) => void;
  setIsRecording: (recording: boolean) => void;
  resolveRecordingTrack: (type: RecordingType) => Track;
  finalizeRecording: (
    type: RecordingType,
    startBeat: number,
    startSeconds: number,
    bpm: number
  ) => Promise<void>;
  rescheduleIfPlaying: () => void;
}

const DEFAULT_BPM = 140;
const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };

let rafId: number | null = null;
let metronomeSynth: Tone.MembraneSynth | null = null;
let metronomeLoop: Tone.Loop | null = null;

function beatsToSeconds(beat: number, bpm: number): number {
  return (beat / (bpm / 60));
}

function secondsToBeats(seconds: number, bpm: number): number {
  return seconds * (bpm / 60);
}

function initMetronome() {
  if (metronomeSynth) return;
  metronomeSynth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
  }).toDestination();
  metronomeSynth.volume.value = -6;
}

function updateMetronomeLoop(enabled: boolean, timeSignature: TimeSignature) {
  if (!metronomeSynth) initMetronome();
  if (metronomeLoop) {
    metronomeLoop.dispose();
    metronomeLoop = null;
  }
  if (!enabled) return;
  metronomeLoop = new Tone.Loop((time) => {
    if (!metronomeSynth) return;
    const pos = Tone.Transport.position.toString();
    const [bars, quarters] = pos.split(":").map(Number);
    const isDownbeat = quarters === 0;
    metronomeSynth.triggerAttackRelease(isDownbeat ? "C2" : "G2", "32n", time, isDownbeat ? 1 : 0.6);
  }, "4n").start(0);
}

function applyLoop(isLooping: boolean, loopStart: number, loopEnd: number, bpm: number) {
  Tone.Transport.loop = isLooping;
  if (isLooping) {
    Tone.Transport.loopStart = beatsToSeconds(loopStart, bpm);
    Tone.Transport.loopEnd = beatsToSeconds(loopEnd, bpm);
  }
}

function startRaf(setCurrentBeat: (beat: number) => void, getState: () => TransportState) {
  if (rafId !== null) return;
  const tick = () => {
    const state = getState();
    const beat = secondsToBeats(Tone.Transport.seconds, state.bpm);
    if (Math.abs(beat - state.currentBeat) > 0.001) {
      setCurrentBeat(beat);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playing: false,
  isReady: false,
  bpm: DEFAULT_BPM,
  currentBeat: 0,
  timeSignature: DEFAULT_TIME_SIGNATURE,
  isRecording: false,
  recordEnabled: false,
  recordingType: null,
  recordStartBeat: 0,
  recordStartTimeSeconds: 0,
  isLooping: false,
  loopStart: 0,
  loopEnd: 16,
  metronomeEnabled: false,

  resolveRecordingTrack: (type: RecordingType) => {
    const { tracks, selectedTrackId, addTrack, updateTrack, selectTrack } = useProjectStore.getState();
    const selected = tracks.find((t) => t.id === selectedTrackId);
    const compatible =
      selected &&
      ((type === "audio" && selected.type === "audio") ||
        (type === "midi" &&
          ["midi", "drum", "bass", "synth", "sampler"].includes(selected.type)));

    if (compatible) {
      if (!selected.arm) {
        updateTrack({ ...selected, arm: true });
      }
      return selected;
    }

    const count = tracks.filter((t) => t.type === type).length;
    const track: Track = {
      id: crypto.randomUUID(),
      name: `${type === "audio" ? "Audio" : "MIDI"} Record ${count + 1}`,
      type,
      color: type === "audio" ? "#3b82f6" : "#a855f7",
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      arm: true,
      clips: [],
      automationLanes: [],
      instrument:
        type === "midi"
          ? { type: "tonejs", preset: "synth", settings: {} }
          : undefined,
    };
    addTrack(track);
    selectTrack(track.id);
    return track;
  },

  finalizeRecording: async (type: RecordingType, startBeat: number, startSeconds: number, bpm: number) => {
    const { project, addClip, updateTrack, selectClip } = useProjectStore.getState();
    const { resolveRecordingTrack } = get();
    if (!project) return;

    try {
      if (type === "audio") {
        const result = await stopAudioRecording(startBeat, bpm);
        if (!result) return;

        const id = crypto.randomUUID();
        const ext = result.mimeType.includes("webm") ? "webm" : result.mimeType.includes("ogg") ? "ogg" : "bin";
        const root = project.rootUri.replace(/\/$/, "");
        const fileName = `recordings/${id}.${ext}`;
        const uri = `${root}/${fileName}`;
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        await writeFile(uri, bytes);

        const durationSeconds = Math.max(0, Tone.Transport.seconds - startSeconds);
        const durationBeats = durationSeconds * (bpm / 60);
        const track = resolveRecordingTrack("audio");
        const clip: Clip = {
          id,
          name: `Audio ${new Date().toLocaleTimeString()}`,
          type: "audio",
          trackId: track.id,
          start: startBeat,
          duration: Math.max(0.25, durationBeats),
          loop: false,
          audioFilePath: uri,
          gain: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        addClip(clip);
        updateTrack({ ...track, clips: [...track.clips, clip.id] });
        selectClip(clip.id);
        useAppStore.getState().addNotification(`Audio clip recorded: ${clip.name}`, "success");
      } else {
        const { notes } = stopMidiRecording(startSeconds, bpm);
        if (notes.length === 0) {
          useAppStore.getState().addNotification("No MIDI notes captured", "info");
          return;
        }

        const id = crypto.randomUUID();
        const track = resolveRecordingTrack("midi");
        const durationBeats = Math.max(
          get().timeSignature.numerator,
          ...notes.map((n) => n.start + n.duration)
        );
        const clip: Clip = {
          id,
          name: `MIDI ${new Date().toLocaleTimeString()}`,
          type: "midi",
          trackId: track.id,
          start: startBeat,
          duration: durationBeats,
          loop: false,
          midiData: { notes },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        addClip(clip);
        updateTrack({ ...track, clips: [...track.clips, clip.id] });
        selectClip(clip.id);
        useAppStore.getState().addNotification(`MIDI clip recorded: ${clip.name}`, "success");
      }
    } catch (err) {
      useAppStore.getState().addNotification(`Recording failed: ${String(err)}`, "error");
    }
  },

  setBpm: (bpm) => {
    Tone.Transport.bpm.value = bpm;
    set({ bpm });
    applyLoop(get().isLooping, get().loopStart, get().loopEnd, bpm);
  },

  syncToProject: (project) => {
    const bpm = project?.bpm ?? DEFAULT_BPM;
    const timeSignature = project?.timeSignature
      ? { numerator: project.timeSignature[0], denominator: project.timeSignature[1] }
      : DEFAULT_TIME_SIGNATURE;
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.timeSignature = [timeSignature.numerator, timeSignature.denominator];
    Tone.Transport.seconds = 0;
    set({
      bpm,
      timeSignature,
      currentBeat: 0,
      playing: false,
      isRecording: false,
      recordEnabled: false,
      recordingType: null,
      loopStart: 0,
      loopEnd: timeSignature.numerator * 4,
    });
    applyLoop(get().isLooping, get().loopStart, get().loopEnd, bpm);
  },

  play: async () => {
    await Tone.start();
    initMixer();
    startRaf((beat) => set({ currentBeat: beat }), get);
    if (get().metronomeEnabled) {
      updateMetronomeLoop(true, get().timeSignature);
    }
    applyLoop(get().isLooping, get().loopStart, get().loopEnd, get().bpm);

    let recordingType: RecordingType | null = null;
    let recordingStarted = false;
    if (get().recordEnabled) {
      const selected = useProjectStore
        .getState()
        .tracks.find((t) => t.id === useProjectStore.getState().selectedTrackId);
      recordingType =
        selected?.type === "audio" || !selected ? "audio" : "midi";
      try {
        if (recordingType === "audio") {
          await startAudioRecording();
        } else {
          await startMidiRecording();
        }
        recordingStarted = true;
      } catch (err) {
        useAppStore
          .getState()
          .addNotification(`Could not start recording: ${String(err)}`, "error");
        set({ recordEnabled: false });
      }
    }

    await scheduleArrangement(
      useProjectStore.getState().tracks,
      useProjectStore.getState().clips,
      get().bpm
    );
    Tone.Transport.start();

    if (recordingStarted) {
      set({
        playing: true,
        isRecording: true,
        recordingType,
        recordStartBeat: get().currentBeat,
        recordStartTimeSeconds: Tone.Transport.seconds,
      });
    } else {
      set({ playing: true });
    }
  },

  pause: () => {
    if (get().isRecording) {
      get().stop();
      return;
    }
    Tone.Transport.pause();
    set({ playing: false });
  },

  stop: () => {
    const wasRecording = get().isRecording;
    const recordingType = get().recordingType;
    const recordStartBeat = get().recordStartBeat;
    const recordStartTimeSeconds = get().recordStartTimeSeconds;
    const bpm = get().bpm;

    Tone.Transport.stop();
    Tone.Transport.seconds = 0;
    clearArrangement();
    set({
      playing: false,
      isRecording: false,
      recordingType: null,
      recordEnabled: false,
      currentBeat: 0,
    });

    if (wasRecording && recordingType) {
      void get().finalizeRecording(recordingType, recordStartBeat, recordStartTimeSeconds, bpm);
    }
  },

  toggle: async () => {
    const { playing, play, pause } = get();
    if (playing) {
      pause();
    } else {
      await play();
    }
  },

  seekToStart: () => {
    get().seekToBeat(0);
  },

  seekToBeat: (beat) => {
    const safeBeat = Math.max(0, beat);
    Tone.Transport.seconds = beatsToSeconds(safeBeat, get().bpm);
    set({ currentBeat: safeBeat });
  },

  toggleLoop: () => {
    const next = !get().isLooping;
    set({ isLooping: next });
    applyLoop(next, get().loopStart, get().loopEnd, get().bpm);
  },

  setLoopRegion: (start, end) => {
    const loopStart = Math.min(start, end);
    const loopEnd = Math.max(start, end);
    set({ loopStart, loopEnd });
    applyLoop(get().isLooping, loopStart, loopEnd, get().bpm);
  },

  toggleMetronome: () => {
    const next = !get().metronomeEnabled;
    set({ metronomeEnabled: next });
    updateMetronomeLoop(next, get().timeSignature);
  },

  toggleRecordArm: () => {
    set((state) => ({ recordEnabled: !state.recordEnabled }));
  },

  setCurrentBeat: (beat) => set({ currentBeat: beat }),

  setIsRecording: (recording) => set({ isRecording: recording }),

  rescheduleIfPlaying: () => {
    if (!get().playing) return;
    clearArrangement();
    void scheduleArrangement(
      useProjectStore.getState().tracks,
      useProjectStore.getState().clips,
      get().bpm
    );
  },
}));
