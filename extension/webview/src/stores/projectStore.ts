import { create } from "zustand";

interface ProjectState {
  projectName: string;
  bpm: number;
  swing: number;
  isPlaying: boolean;
  setProjectName: (name: string) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  togglePlay: () => void;
  stop: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: "Untitled Project",
  bpm: 142,
  swing: 0.68,
  isPlaying: false,
  setProjectName: (name) => set({ projectName: name }),
  setBpm: (bpm) => set({ bpm }),
  setSwing: (swing) => set({ swing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  stop: () => set({ isPlaying: false }),
}));
