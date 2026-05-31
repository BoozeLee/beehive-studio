import { create } from "zustand";
import type { Track, Clip, ID } from "../../../../packages/core-models/index";

export interface TimelineState {
  tracks: Track[];
  clips: Record<ID, Clip>;
  selectedTrackId: ID | null;
  selectedClipId: ID | null;
  cursorPosition: number;
  zoom: number;
  scrollOffset: { x: number; y: number };
  snapToGrid: boolean;
  gridDivision: number;

  setTracks: (tracks: Track[]) => void;
  addTrack: (track: Track) => void;
  updateTrack: (id: ID, partial: Partial<Track>) => void;
  removeTrack: (id: ID) => void;

  setClips: (clips: Record<ID, Clip>) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: ID, partial: Partial<Clip>) => void;
  removeClip: (id: ID) => void;

  selectTrack: (id: ID | null) => void;
  selectClip: (id: ID | null) => void;
  setCursorPosition: (beats: number) => void;
  setZoom: (zoom: number) => void;
  setScrollOffset: (offset: { x: number; y: number }) => void;
  setSnapToGrid: (snap: boolean) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  tracks: [],
  clips: {},
  selectedTrackId: null,
  selectedClipId: null,
  cursorPosition: 0,
  zoom: 16,
  scrollOffset: { x: 0, y: 0 },
  snapToGrid: true,
  gridDivision: 1,

  setTracks: (tracks) => set({ tracks }),

  addTrack: (track) =>
    set((state) => ({ tracks: [...state.tracks, track] })),

  updateTrack: (id, partial) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, ...partial } : t
      ),
    })),

  removeTrack: (id) =>
    set((state) => ({
      tracks: state.tracks.filter((t: Track) => t.id !== id),
      selectedTrackId:
        state.selectedTrackId === id ? null : state.selectedTrackId,
    })),

  setClips: (clips) => set({ clips }),

  addClip: (clip) =>
    set((state) => ({
      clips: { ...state.clips, [clip.id]: clip },
      tracks: state.tracks.map((t) =>
        t.id === clip.trackId && !t.clips.includes(clip.id)
          ? { ...t, clips: [...t.clips, clip.id] }
          : t
      ),
    })),

  updateClip: (id, partial) =>
    set((state) => ({
      clips: state.clips[id]
        ? { ...state.clips, [id]: { ...state.clips[id], ...partial } }
        : state.clips,
    })),

  removeClip: (id) =>
    set((state) => {
      const { [id]: removed, ...rest } = state.clips;
      return {
        clips: rest,
        tracks: state.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((cId: string) => cId !== id),
        })),
        selectedClipId:
          state.selectedClipId === id ? null : state.selectedClipId,
      };
    }),

  selectTrack: (id) => set({ selectedTrackId: id, selectedClipId: null }),
  selectClip: (id) => set({ selectedClipId: id }),
  setCursorPosition: (beats) => set({ cursorPosition: beats }),
  setZoom: (zoom) => set({ zoom: Math.max(4, Math.min(128, zoom)) }),
  setScrollOffset: (offset) => set({ scrollOffset: offset }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
}));
