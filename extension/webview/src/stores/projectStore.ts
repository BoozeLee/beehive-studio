import { create } from "zustand";
import type { BuildJob, CreativeBranch, TasteEdge, TasteNode } from "../../../src/services/types";
import type { Clip, Track } from "../lib/desktopTypes";

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

  setProject: (project: BeehiveProject | null) => void;
  setClips: (clips: Clip[]) => void;
  setTracks: (tracks: Track[]) => void;
  addClip: (clip: Clip) => void;
  updateClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  selectClip: (id?: string) => void;
  selectTrack: (id?: string) => void;
  addBuildJob: (job: BuildJob) => void;
  updateBuildJob: (job: BuildJob) => void;
  setActiveBuildId: (id?: string) => void;
  setTasteGraph: (nodes: TasteNode[], edges: TasteEdge[]) => void;
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

  setProject: (project) => set({ project }),

  setClips: (clips) => set({ clips }),

  setTracks: (tracks) => set({ tracks }),

  addClip: (clip) =>
    set((state) => ({
      clips: [...state.clips, clip],
    })),

  updateClip: (clip) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clip.id ? clip : c)),
    })),

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
    })),

  selectClip: (id) => set({ selectedClipId: id }),

  selectTrack: (id) => set({ selectedTrackId: id }),

  addBuildJob: (job) =>
    set((state) => ({
      buildJobs: [job, ...state.buildJobs],
      activeBuildId: job.id,
    })),

  updateBuildJob: (job) =>
    set((state) => ({
      buildJobs: state.buildJobs.map((j) => (j.id === job.id ? job : j)),
    })),

  setActiveBuildId: (id) => set({ activeBuildId: id }),

  setTasteGraph: (nodes, edges) => set({ tasteNodes: nodes, tasteEdges: edges }),
}));
