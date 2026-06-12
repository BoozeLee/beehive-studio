import { create } from "zustand";

export interface BuildLogEntry {
  id: string;
  timestamp: number;
  level: "info" | "success" | "error" | "warn";
  message: string;
  taskId?: string;
  backend?: string;
  metadata?: Record<string, unknown>;
}

interface BuildLogState {
  logs: BuildLogEntry[];
  addLog: (entry: Omit<BuildLogEntry, "id" | "timestamp">) => void;
  clearLogs: () => void;
  setLogs: (logs: BuildLogEntry[]) => void;
}

export const useBuildLogStore = create<BuildLogState>((set) => ({
  logs: [],

  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  clearLogs: () => set({ logs: [] }),

  setLogs: (logs) => set({ logs }),
}));
