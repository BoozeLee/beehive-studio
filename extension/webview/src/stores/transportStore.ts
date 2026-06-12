import { create } from "zustand";
import * as Tone from "tone";

interface TransportState {
  playing: boolean;
  bpm: number;
  currentBeat: number;

  setBpm: (bpm: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  toggle: () => Promise<void>;
  setCurrentBeat: (beat: number) => void;
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playing: false,
  bpm: 140,
  currentBeat: 0,

  setBpm: (bpm) => {
    Tone.Transport.bpm.value = bpm;
    set({ bpm });
  },

  play: async () => {
    await Tone.start();
    Tone.Transport.start();
    set({ playing: true });
  },

  pause: () => {
    Tone.Transport.pause();
    set({ playing: false });
  },

  stop: () => {
    Tone.Transport.stop();
    set({ playing: false, currentBeat: 0 });
  },

  toggle: async () => {
    const { playing, play, pause } = get();
    if (playing) {
      pause();
    } else {
      await play();
    }
  },

  setCurrentBeat: (beat) => set({ currentBeat: beat }),
}));
