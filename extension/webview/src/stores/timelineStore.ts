import { create } from "zustand";

export interface TimelineState {
  zoom: number;
  scrollOffset: { x: number; y: number };
  snapToGrid: boolean;
  gridDivision: number;
  cursorPosition: number;

  setZoom: (zoom: number) => void;
  setScrollOffset: (offset: { x: number; y: number }) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridDivision: (division: number) => void;
  setCursorPosition: (beats: number) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  zoom: 16,
  scrollOffset: { x: 0, y: 0 },
  snapToGrid: true,
  gridDivision: 1,
  cursorPosition: 0,

  setZoom: (zoom) => set({ zoom: Math.max(4, Math.min(128, zoom)) }),
  setScrollOffset: (offset) => set({ scrollOffset: offset }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setGridDivision: (division) => set({ gridDivision: Math.max(0.25, division) }),
  setCursorPosition: (beats) => set({ cursorPosition: beats }),
}));
