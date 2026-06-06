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
  moveClipToTrack: (id: ID, trackId: ID, start: number) => void;
  resizeClip: (id: ID, duration: number) => void;
  duplicateClip: (id: ID, newId?: ID) => ID | null;
  updateClipMidiNotes: (id: ID, notes: NonNullable<Clip["midiData"]>["notes"]) => void;

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

  moveClipToTrack: (id, trackId, start) =>
    set((state) => {
      const clip = state.clips[id];
      if (!clip || !state.tracks.some((t) => t.id === trackId)) return state;

      return {
        clips: {
          ...state.clips,
          [id]: {
            ...clip,
            trackId,
            start: Math.max(0, start),
            updatedAt: Date.now() / 1000,
          },
        },
        tracks: state.tracks.map((track) => {
          const withoutClip = track.clips.filter((clipId) => clipId !== id);
          if (track.id !== trackId) return { ...track, clips: withoutClip };
          return { ...track, clips: [...withoutClip, id] };
        }),
        selectedTrackId: null,
        selectedClipId: id,
      };
    }),

  resizeClip: (id, duration) =>
    set((state) => {
      const clip = state.clips[id];
      if (!clip) return state;

      return {
        clips: {
          ...state.clips,
          [id]: {
            ...clip,
            duration: Math.max(state.gridDivision, duration),
            updatedAt: Date.now() / 1000,
          },
        },
        selectedClipId: id,
      };
    }),

  duplicateClip: (id, newId = crypto.randomUUID()) => {
    let createdId: ID | null = null;
    set((state) => {
      const clip = state.clips[id];
      if (!clip) return state;

      const now = Date.now() / 1000;
      const duplicate: Clip = {
        ...clip,
        id: newId,
        name: `${clip.name} Copy`,
        start: clip.start + clip.duration,
        createdAt: now,
        updatedAt: now,
      };
      createdId = newId;

      return {
        clips: { ...state.clips, [newId]: duplicate },
        tracks: state.tracks.map((track) =>
          track.id === clip.trackId
            ? { ...track, clips: [...track.clips.filter((clipId) => clipId !== newId), newId] }
            : track
        ),
        selectedTrackId: null,
        selectedClipId: newId,
      };
    });
    return createdId;
  },

  updateClipMidiNotes: (id, notes) =>
    set((state) => {
      const clip = state.clips[id];
      if (!clip?.midiData) return state;
      const clampedNotes = notes
        .filter((note) => note.start < clip.duration)
        .map((note) => ({
          ...note,
          duration: Math.max(0.01, Math.min(note.duration, clip.duration - note.start)),
        }));
      return {
        clips: {
          ...state.clips,
          [id]: {
            ...clip,
            midiData: { ...clip.midiData, notes: clampedNotes },
            updatedAt: Date.now() / 1000,
          },
        },
      };
    }),

  selectTrack: (id) => set({ selectedTrackId: id, selectedClipId: null }),
  selectClip: (id) =>
    set(id ? { selectedClipId: id, selectedTrackId: null } : { selectedClipId: null }),
  setCursorPosition: (beats) => set({ cursorPosition: beats }),
  setZoom: (zoom) => set({ zoom: Math.max(4, Math.min(128, zoom)) }),
  setScrollOffset: (offset) => set({ scrollOffset: offset }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
}));
