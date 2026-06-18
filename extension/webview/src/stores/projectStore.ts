import { create } from "zustand";
import type { BuildEvent, BuildJob, CreativeBranch, TasteEdge, TasteNode } from "../../../src/services/types";
import type { Clip, Track } from "../lib/desktopTypes";
import type { PatternLibraryEntry } from "../lib/patternTypes";

export interface BeehiveProject {
  id: string;
  name: string;
  rootUri: string;
  bpm: number;
  timeSignature: [number, number];
  activeBranchId: string;
  branches: Record<string, CreativeBranch>;
  createdAt: number;
  updatedAt: number;
}

export type { Clip, Track };

interface ProjectState {
  project: BeehiveProject | null;
  clips: Clip[];
  tracks: Track[];
  selectedClipId?: string;
  selectedTrackId?: string;
  buildJobs: BuildJob[];
  activeBuildId?: string;
  tasteNodes: TasteNode[];
  tasteEdges: TasteEdge[];
  patterns: PatternLibraryEntry[];

  setProject: (project: BeehiveProject | null) => void;
  setClips: (clips: Clip[]) => void;
  setTracks: (tracks: Track[]) => void;
  addClip: (clip: Clip) => void;
  updateClip: (clip: Clip) => void;
  patchClip: (id: string, partial: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  moveClipToTrack: (id: string, trackId: string, start: number) => void;
  resizeClip: (id: string, duration: number) => void;
  duplicateClip: (id: string) => string | null;
  splitClipAt: (id: string, beat: number) => string | null;
  updateClipMidiNotes: (id: string, notes: NonNullable<Clip["midiData"]>["notes"]) => void;
  selectClip: (id?: string) => void;
  selectTrack: (id?: string) => void;
  addTrack: (track: Track) => void;
  updateTrack: (track: Track) => void;
  patchTrack: (id: string, partial: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  addBuildJob: (job: BuildJob) => void;
  updateBuildJob: (job: BuildJob) => void;
  updateBuildJobFromEvent: (event: BuildEvent) => void;
  setActiveBuildId: (id?: string) => void;
  setTasteGraph: (nodes: TasteNode[], edges: TasteEdge[]) => void;

  setPatterns: (patterns: PatternLibraryEntry[]) => void;
  addPattern: (pattern: PatternLibraryEntry) => void;
  updatePattern: (pattern: PatternLibraryEntry) => void;
  removePattern: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  clips: [],
  tracks: [],
  selectedClipId: undefined,
  selectedTrackId: undefined,
  buildJobs: [],
  activeBuildId: undefined,
  tasteNodes: [],
  tasteEdges: [],
  patterns: [],

  setProject: (project) => set({ project }),

  setClips: (clips) => set({ clips }),

  setTracks: (tracks) => set({ tracks }),

  addClip: (clip) =>
    set((state) => ({
      clips: [...state.clips, clip],
      tracks: state.tracks.map((t) =>
        t.id === clip.trackId && !t.clips.includes(clip.id)
          ? { ...t, clips: [...t.clips, clip.id] }
          : t
      ),
    })),

  updateClip: (clip) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clip.id ? clip : c)),
    })),

  patchClip: (id, partial) =>
    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === id ? { ...c, ...partial, updatedAt: Date.now() } : c
      ),
    })),

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((clipId) => clipId !== id),
      })),
      selectedClipId: state.selectedClipId === id ? undefined : state.selectedClipId,
    })),

  moveClipToTrack: (id, trackId, start) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip || !state.tracks.some((t) => t.id === trackId)) return state;
      return {
        clips: state.clips.map((c) =>
          c.id === id
            ? { ...c, trackId, start: Math.max(0, start), updatedAt: Date.now() }
            : c
        ),
        tracks: state.tracks.map((track) => {
          const withoutClip = track.clips.filter((clipId) => clipId !== id);
          if (track.id !== trackId) return { ...track, clips: withoutClip };
          return { ...track, clips: [...withoutClip, id] };
        }),
        selectedTrackId: undefined,
        selectedClipId: id,
      };
    }),

  resizeClip: (id, duration) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;
      const grid = 0.25; // smallest grid unit for clamp
      return {
        clips: state.clips.map((c) =>
          c.id === id
            ? { ...c, duration: Math.max(grid, duration), updatedAt: Date.now() }
            : c
        ),
        selectedClipId: id,
      };
    }),

  duplicateClip: (id) => {
    let createdId: string | null = null;
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;
      const newId = crypto.randomUUID();
      createdId = newId;
      const now = Date.now();
      const duplicate: Clip = {
        ...clip,
        id: newId,
        name: `${clip.name} Copy`,
        start: clip.start + clip.duration,
        createdAt: now,
        updatedAt: now,
      };
      return {
        clips: [...state.clips, duplicate],
        tracks: state.tracks.map((track) =>
          track.id === clip.trackId
            ? { ...track, clips: [...track.clips.filter((clipId) => clipId !== newId), newId] }
            : track
        ),
        selectedTrackId: undefined,
        selectedClipId: newId,
      };
    });
    return createdId;
  },

  splitClipAt: (id, beat) => {
    let createdId: string | null = null;
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;
      const splitOffset = beat - clip.start;
      if (splitOffset <= 0 || splitOffset >= clip.duration) return state;
      const newId = crypto.randomUUID();
      createdId = newId;
      const now = Date.now();
      const leftNotes = clip.midiData?.notes
        .filter((note) => note.start < splitOffset)
        .map((note) => ({
          ...note,
          duration: Math.min(note.duration, splitOffset - note.start),
        }));
      const rightNotes = clip.midiData?.notes
        .filter((note) => note.start + note.duration > splitOffset)
        .map((note) => ({
          ...note,
          start: Math.max(0, note.start - splitOffset),
          duration: Math.min(note.duration, note.start + note.duration - splitOffset),
        }));
      const right: Clip = {
        ...clip,
        id: newId,
        name: `${clip.name} Split`,
        start: beat,
        duration: clip.duration - splitOffset,
        midiData: clip.midiData ? { ...clip.midiData, notes: rightNotes ?? [] } : undefined,
        audioSourceOffset: (clip.audioSourceOffset ?? 0) + splitOffset * (state.project ? 60 / state.project.bpm : 0.5),
        createdAt: now,
        updatedAt: now,
      };
      const updatedClips = state.clips.map((c) =>
        c.id === id
          ? {
              ...c,
              duration: splitOffset,
              midiData: c.midiData ? { ...c.midiData, notes: leftNotes ?? [] } : undefined,
              updatedAt: now,
            }
          : c
      );
      return {
        clips: [...updatedClips, right],
        tracks: state.tracks.map((track) =>
          track.id === clip.trackId
            ? { ...track, clips: [...track.clips.filter((clipId) => clipId !== newId), newId] }
            : track
        ),
        selectedClipId: newId,
      };
    });
    return createdId;
  },

  updateClipMidiNotes: (id, notes) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip?.midiData) return state;
      const clampedNotes = notes
        .filter((note) => note.start < clip.duration)
        .map((note) => ({
          ...note,
          duration: Math.max(0.01, Math.min(note.duration, clip.duration - note.start)),
        }));
      return {
        clips: state.clips.map((c) =>
          c.id === id
            ? { ...c, midiData: { ...c.midiData!, notes: clampedNotes }, updatedAt: Date.now() }
            : c
        ),
      };
    }),

  selectClip: (id) => set(id ? { selectedClipId: id, selectedTrackId: undefined } : { selectedClipId: undefined }),

  selectTrack: (id) => set(id ? { selectedTrackId: id, selectedClipId: undefined } : { selectedTrackId: undefined }),

  addTrack: (track) =>
    set((state) => ({
      tracks: [...state.tracks, track],
    })),

  updateTrack: (track) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === track.id ? track : t)),
    })),

  patchTrack: (id, partial) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, ...partial, updatedAt: Date.now() } : t
      ),
    })),

  removeTrack: (id) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== id),
      clips: state.clips.filter((c) => c.trackId !== id),
      selectedTrackId: state.selectedTrackId === id ? undefined : state.selectedTrackId,
    })),

  addBuildJob: (job) =>
    set((state) => ({
      buildJobs: [job, ...state.buildJobs],
      activeBuildId: job.id,
    })),

  updateBuildJob: (job) =>
    set((state) => ({
      buildJobs: state.buildJobs.map((j) => (j.id === job.id ? job : j)),
    })),

  updateBuildJobFromEvent: (event) =>
    set((state) => {
      const existing = state.buildJobs.find((j) => j.id === event.buildId);
      const payload = event.payload || {};
      const status = (payload.status as BuildJob["status"]) || existing?.status;
      const progress = typeof payload.progress === "number" ? payload.progress : existing?.progress;
      const error = payload.error !== undefined ? String(payload.error || "") : existing?.error;
      const provider = payload.provider ? String(payload.provider) : existing?.provider;
      const artifacts = Array.isArray(payload.artifacts) ? (payload.artifacts as BuildJob["artifacts"]) : existing?.artifacts;

      const updated: BuildJob = {
        ...(existing || {
          id: event.buildId,
          projectId: event.projectId,
          plan: { id: "", summary: "", projectRevision: 0, proposedPatches: [], executionSteps: [], warnings: [], confidence: {}, attribution: {}, degraded: false },
          status: "running",
          progress: 0,
          artifacts: [],
        }),
        ...(status ? { status } : {}),
        ...(progress !== undefined ? { progress } : {}),
        ...(error !== undefined ? { error } : {}),
        ...(provider ? { provider } : {}),
        ...(artifacts ? { artifacts } : {}),
      };

      return {
        buildJobs: existing
          ? state.buildJobs.map((j) => (j.id === event.buildId ? updated : j))
          : [updated, ...state.buildJobs],
      };
    }),

  setActiveBuildId: (id) => set({ activeBuildId: id }),

  setTasteGraph: (nodes, edges) => set({ tasteNodes: nodes, tasteEdges: edges }),

  setPatterns: (patterns) => set({ patterns }),

  addPattern: (pattern) =>
    set((state) => ({
      patterns: [...state.patterns, pattern],
    })),

  updatePattern: (pattern) =>
    set((state) => ({
      patterns: state.patterns.map((p) => (p.id === pattern.id ? pattern : p)),
    })),

  removePattern: (id) =>
    set((state) => ({
      patterns: state.patterns.filter((p) => p.id !== id),
    })),
}));
