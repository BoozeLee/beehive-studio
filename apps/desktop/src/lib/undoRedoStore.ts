import { create } from "zustand";
import type { TimelineState } from "./timelineStore";

interface UndoRedoState {
  past: TimelineState[];
  future: TimelineState[];
  present: TimelineState;
  setPresent: (state: TimelineState) => void;
  push: (state: TimelineState) => void;
  undo: () => TimelineState;
  redo: () => TimelineState;
  clear: () => void;
}

export const useUndoRedoStore = create<UndoRedoState>((set, get) => ({
  past: [],
  future: [],
  present: {} as TimelineState,

  setPresent: (state) => {
    set({ present: state });
  },

  push: (state) => {
    set((s) => ({
      past: [...s.past, s.present].slice(-50),
      future: [],
      present: state,
    }));
  },

  undo: () => {
    const { past, present, future } = get();
    if (past.length === 0) return present;
    const newPast = past.slice(0, -1);
    const previous = past[past.length - 1];
    set({
      past: newPast,
      future: [present, ...future],
      present: previous,
    });
    return previous;
  },

  redo: () => {
    const { future, present, past } = get();
    if (future.length === 0) return present;
    const next = future[0];
    set({
      past: [...past, present],
      future: future.slice(1),
      present: next,
    });
    return next;
  },

  clear: () => {
    set({ past: [], future: [], present: {} as TimelineState });
  },
}));