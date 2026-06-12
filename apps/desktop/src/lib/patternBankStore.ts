import { create } from "zustand";
import type { PatternState, QaResult } from "../components/PatternEditor/PatternEditor";
import type { Track } from "../../../../packages/core-models/index";

export interface PatternRecord {
  id: string;
  name: string;
  pattern: PatternState;
  swing: number;
  qa?: QaResult;
  reasoning?: string[];
  sourceClipId?: string;
  createdAt: number;
  updatedAt: number;
}

interface PatternBankState {
  patterns: PatternRecord[];
  selectedPatternId: string | null;
  setPatterns: (patterns: PatternRecord[]) => void;
  addPattern: (pattern: PatternRecord) => void;
  updatePattern: (id: string, partial: Partial<PatternRecord>) => void;
  duplicatePattern: (id: string, newId?: string) => string | null;
  removePattern: (id: string) => void;
  selectPattern: (id: string | null) => void;
}

export const usePatternBankStore = create<PatternBankState>((set) => ({
  patterns: [],
  selectedPatternId: null,

  setPatterns: (patterns) =>
    set({
      patterns,
      selectedPatternId: patterns[0]?.id ?? null,
    }),

  addPattern: (pattern) =>
    set((state) => ({
      patterns: [...state.patterns, pattern],
      selectedPatternId: pattern.id,
    })),

  updatePattern: (id, partial) =>
    set((state) => ({
      patterns: state.patterns.map((pattern) =>
        pattern.id === id
          ? { ...pattern, ...partial, updatedAt: Date.now() / 1000 }
          : pattern
      ),
    })),

  duplicatePattern: (id, newId = crypto.randomUUID()) => {
    let duplicatedId: string | null = null;
    set((state) => {
      const pattern = state.patterns.find((item) => item.id === id);
      if (!pattern) return state;
      const now = Date.now() / 1000;
      duplicatedId = newId;
      return {
        patterns: [
          ...state.patterns,
          {
            ...pattern,
            id: newId,
            name: `${pattern.name} Copy`,
            sourceClipId: undefined,
            createdAt: now,
            updatedAt: now,
          },
        ],
        selectedPatternId: newId,
      };
    });
    return duplicatedId;
  },

  removePattern: (id) =>
    set((state) => {
      const patterns = state.patterns.filter((pattern) => pattern.id !== id);
      return {
        patterns,
        selectedPatternId:
          state.selectedPatternId === id ? patterns[0]?.id ?? null : state.selectedPatternId,
      };
    }),

  selectPattern: (id) => set({ selectedPatternId: id }),
}));

export function createDefaultPattern(name = "Drum Pattern"): PatternRecord {
  const rows = ["kick", "snare", "hihat-c", "hihat-o", "clap", "tom-h", "tom-m", "rim"];
  const steps: PatternState["steps"] = {};
  for (const row of rows) {
    steps[row] = Array.from({ length: 16 }, (_, index) => ({
      active: index % 4 === 0 && (row === "kick" || row === "hihat-c"),
      velocity: 100,
    }));
  }
  const now = Date.now() / 1000;
  return {
    id: crypto.randomUUID(),
    name,
    pattern: { rows, steps, stepCount: 16, resolution: 0.25 },
    swing: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolvePatternTargetTrack(
  tracks: Track[],
  selectedTrackId: string | null
): Track | undefined {
  return (
    tracks.find((track) => track.id === selectedTrackId && track.type === "midi") ??
    tracks.find((track) => track.type === "midi")
  );
}
