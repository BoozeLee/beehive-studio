import { create } from "zustand";
import type {
  StepData,
  RowConfig,
  QaResult,
  PatternLibraryEntry,
  PatternState,
} from "../lib/patternTypes";
import {
  DRUM_ROWS,
  createEmptySteps,
  resizeSteps,
} from "../lib/patternTypes";
import { useProjectStore } from "./projectStore";

interface PatternSnapshot {
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
  swing: number;
}

interface PatternStoreState {
  library: PatternLibraryEntry[];
  currentPatternId?: string;
  name: string;
  rows: RowConfig[];
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
  swing: number;
  agentId?: string;
  qa?: QaResult;
  reasoning: string[];
  isGenerating: boolean;
  brief: string;
  undoStack: PatternSnapshot[];
  redoStack: PatternSnapshot[];
}

interface PatternStoreActions {
  setName: (name: string) => void;
  setBrief: (brief: string) => void;
  setAgentId: (agentId?: string) => void;
  setSwing: (swing: number) => void;
  setStepCount: (count: number) => void;
  setQa: (qa?: QaResult) => void;
  setReasoning: (reasoning: string[]) => void;
  setGenerating: (isGenerating: boolean) => void;
  setRows: (rows: RowConfig[]) => void;
  setSteps: (steps: Record<string, StepData[]>) => void;
  toggleStep: (rowId: string, stepIdx: number, forceActive?: boolean, newVelocity?: number) => void;
  cycleVelocity: (rowId: string, stepIdx: number) => void;
  clearPattern: () => void;
  randomizePattern: () => void;
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  saveCurrent: () => string | undefined;
  loadPattern: (id: string) => void;
  deletePattern: (id: string) => void;
  duplicatePattern: (id: string) => string | undefined;
  getCurrentState: () => PatternState & { swing: number; rowsData: RowConfig[] };
  syncFromProject: () => void;
}

const MAX_UNDO = 32;

function cloneSteps(steps: Record<string, StepData[]>): Record<string, StepData[]> {
  const clone: Record<string, StepData[]> = {};
  for (const [rowId, row] of Object.entries(steps)) {
    clone[rowId] = row.map((s) => ({ ...s }));
  }
  return clone;
}

function createDefaultEntry(): PatternLibraryEntry {
  const id = crypto.randomUUID();
  return {
    id,
    name: "Untitled Pattern",
    rows: DRUM_ROWS,
    steps: createEmptySteps(DRUM_ROWS, 16),
    stepCount: 16,
    resolution: 0.25,
    swing: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const usePatternStore = create<PatternStoreState & PatternStoreActions>(
  (set, get) => {
    const defaultEntry = createDefaultEntry();
    return {
      library: [defaultEntry],
      currentPatternId: defaultEntry.id,
      name: defaultEntry.name,
      rows: defaultEntry.rows,
      steps: cloneSteps(defaultEntry.steps),
      stepCount: defaultEntry.stepCount,
      resolution: defaultEntry.resolution,
      swing: defaultEntry.swing,
      agentId: undefined,
      qa: undefined,
      reasoning: [],
      isGenerating: false,
      brief: "",
      undoStack: [],
      redoStack: [],

      setName: (name) => set({ name }),
      setBrief: (brief) => set({ brief }),
      setAgentId: (agentId) => set({ agentId }),
      setSwing: (swing) => set({ swing }),

      setStepCount: (count) => {
        const clamped = Math.max(4, Math.min(64, count));
        set((state) => ({
          steps: resizeSteps(state.steps, state.rows, clamped, state.stepCount),
          stepCount: clamped,
          redoStack: [],
        }));
      },

      setQa: (qa) => set({ qa }),
      setReasoning: (reasoning) => set({ reasoning }),
      setGenerating: (isGenerating) => set({ isGenerating }),

      setRows: (rows) => {
        set((state) => {
          const nextSteps: Record<string, StepData[]> = {};
          for (const row of rows) {
            const existing = state.steps[row.id];
            nextSteps[row.id] = existing
              ? existing.slice(0, state.stepCount)
              : Array.from({ length: state.stepCount }, () => ({ active: false, velocity: 0 }));
          }
          return { rows, steps: nextSteps };
        });
      },

      setSteps: (steps) => set({ steps: cloneSteps(steps), redoStack: [] }),

      pushSnapshot: () => {
        set((state) => {
          const snapshot: PatternSnapshot = {
            steps: cloneSteps(state.steps),
            stepCount: state.stepCount,
            resolution: state.resolution,
            swing: state.swing,
          };
          const undoStack = [...state.undoStack, snapshot];
          if (undoStack.length > MAX_UNDO) undoStack.shift();
          return { undoStack, redoStack: [] };
        });
      },

      toggleStep: (rowId, stepIdx, forceActive, newVelocity) => {
        get().pushSnapshot();
        set((state) => {
          const row = state.steps[rowId];
          if (!row) return state;
          const nextRow = [...row];
          const current = nextRow[stepIdx];
          const active = forceActive !== undefined ? forceActive : !current.active;
          nextRow[stepIdx] = {
            active,
            velocity: active ? (newVelocity ?? (current.velocity || 100)) : 0,
          };
          return { steps: { ...state.steps, [rowId]: nextRow } };
        });
      },

      cycleVelocity: (rowId, stepIdx) => {
        const row = get().steps[rowId];
        if (!row || !row[stepIdx].active) return;
        get().pushSnapshot();
        set((state) => {
          const nextRow = [...(state.steps[rowId] ?? row)];
          const currentVel = nextRow[stepIdx].velocity;
          const presets = [127, 100, 70, 50, 30];
          const nextVel = presets.find((v) => v < currentVel) ?? presets[0];
          nextRow[stepIdx] = { ...nextRow[stepIdx], velocity: nextVel };
          return { steps: { ...state.steps, [rowId]: nextRow } };
        });
      },

      clearPattern: () => {
        get().pushSnapshot();
        set((state) => {
          const next: Record<string, StepData[]> = {};
          for (const row of state.rows) {
            next[row.id] = Array.from({ length: state.stepCount }, () => ({
              active: false,
              velocity: 0,
            }));
          }
          return { steps: next, qa: undefined, reasoning: [] };
        });
      },

      randomizePattern: () => {
        get().pushSnapshot();
        set((state) => {
          const next: Record<string, StepData[]> = {};
          for (const row of state.rows) {
            next[row.id] = Array.from({ length: state.stepCount }, () => {
              const active = Math.random() > 0.6;
              return {
                active,
                velocity: active ? 60 + Math.floor(Math.random() * 60) : 0,
              };
            });
          }
          return { steps: next, qa: undefined };
        });
      },

      undo: () => {
        set((state) => {
          if (state.undoStack.length === 0) return state;
          const prev = state.undoStack[state.undoStack.length - 1];
          const nextUndo = state.undoStack.slice(0, -1);
          const current: PatternSnapshot = {
            steps: cloneSteps(state.steps),
            stepCount: state.stepCount,
            resolution: state.resolution,
            swing: state.swing,
          };
          return {
            steps: cloneSteps(prev.steps),
            stepCount: prev.stepCount,
            resolution: prev.resolution,
            swing: prev.swing,
            undoStack: nextUndo,
            redoStack: [...state.redoStack, current],
          };
        });
      },

      redo: () => {
        set((state) => {
          if (state.redoStack.length === 0) return state;
          const next = state.redoStack[state.redoStack.length - 1];
          const nextRedo = state.redoStack.slice(0, -1);
          const current: PatternSnapshot = {
            steps: cloneSteps(state.steps),
            stepCount: state.stepCount,
            resolution: state.resolution,
            swing: state.swing,
          };
          return {
            steps: cloneSteps(next.steps),
            stepCount: next.stepCount,
            resolution: next.resolution,
            swing: next.swing,
            undoStack: [...state.undoStack, current],
            redoStack: nextRedo,
          };
        });
      },

      saveCurrent: () => {
        const state = get();
        const now = Date.now();
        const entryBase = {
          name: state.name || "Untitled Pattern",
          rows: state.rows,
          steps: cloneSteps(state.steps),
          stepCount: state.stepCount,
          resolution: state.resolution,
          swing: state.swing,
          agent: state.agentId,
          updatedAt: now,
        };
        if (state.currentPatternId) {
          set((s) => {
            const library = s.library.map((entry) =>
              entry.id === s.currentPatternId ? { ...entry, ...entryBase } : entry
            );
            useProjectStore.getState().setPatterns(library);
            return { library };
          });
          return state.currentPatternId;
        }
        const id = crypto.randomUUID();
        const entry: PatternLibraryEntry = {
          id,
          ...entryBase,
          createdAt: now,
        };
        set((s) => {
          const library = [...s.library, entry];
          useProjectStore.getState().setPatterns(library);
          return { library, currentPatternId: id };
        });
        return id;
      },

      loadPattern: (id) => {
        const entry = get().library.find((e) => e.id === id);
        if (!entry) return;
        set({
          currentPatternId: entry.id,
          name: entry.name,
          rows: entry.rows,
          steps: cloneSteps(entry.steps),
          stepCount: entry.stepCount,
          resolution: entry.resolution,
          swing: entry.swing,
          agentId: entry.agent,
          undoStack: [],
          redoStack: [],
        });
      },

      deletePattern: (id) => {
        set((s) => {
          const library = s.library.filter((e) => e.id !== id);
          useProjectStore.getState().setPatterns(library);
          return { library };
        });
      },

      duplicatePattern: (id) => {
        const entry = get().library.find((e) => e.id === id);
        if (!entry) return undefined;
        const now = Date.now();
        const copy: PatternLibraryEntry = {
          ...entry,
          id: crypto.randomUUID(),
          name: `${entry.name} Copy`,
          steps: cloneSteps(entry.steps),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => {
          const library = [...s.library, copy];
          useProjectStore.getState().setPatterns(library);
          return { library };
        });
        return copy.id;
      },

      getCurrentState: () => ({
        rows: get().rows.map((r) => r.id),
        steps: cloneSteps(get().steps),
        stepCount: get().stepCount,
        resolution: get().resolution,
        swing: get().swing,
        rowsData: get().rows,
      }),

      syncFromProject: () => {
        const projectPatterns = useProjectStore.getState().patterns;
        if (projectPatterns.length > 0) {
          set({ library: projectPatterns });
        }
      },
    };
  }
);
