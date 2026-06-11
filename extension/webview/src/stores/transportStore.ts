import { create } from "zustand";

interface TransportState {
  isPlaying: boolean;
  currentBeat: number;
  totalBeats: number;
  bpm: number;
  setPlaying: (playing: boolean) => void;
  setCurrentBeat: (beat: number) => void;
  setBpm: (bpm: number) => void;
  tick: () => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  currentBeat: 0,
  totalBeats: 128,
  bpm: 142,
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),
  setBpm: (bpm) => set({ bpm }),
  tick: () =>
    set((s) => ({
      currentBeat: (s.currentBeat + 1) % s.totalBeats,
    })),
}));
