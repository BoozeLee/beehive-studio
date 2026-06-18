export interface StepData {
  active: boolean;
  velocity: number;
}

export interface RowConfig {
  id: string;
  label: string;
  color: string;
  pitch: number;
}

export interface QaResult {
  pass: boolean;
  score: number;
  warnings: string[];
}

export interface PatternState {
  rows: string[];
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
}

export interface PatternLibraryEntry {
  id: string;
  name: string;
  rows: RowConfig[];
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
  swing: number;
  agent?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentPatternData {
  steps?: Record<string, StepData[]>;
  notes?: Array<{ pitch: number; velocity: number; start: number; duration: number }>;
  style?: string;
  step_count?: number;
  qa?: QaResult;
  reasoning?: string[];
}

export const DRUM_ROWS: RowConfig[] = [
  { id: "kick", label: "Kick", color: "#ef4444", pitch: 36 },
  { id: "snare", label: "Snare", color: "#fbbf24", pitch: 38 },
  { id: "hihat-c", label: "HH Closed", color: "#60a5fa", pitch: 42 },
  { id: "hihat-o", label: "HH Open", color: "#3b82f6", pitch: 46 },
  { id: "clap", label: "Clap", color: "#a78bfa", pitch: 39 },
  { id: "tom-h", label: "Tom High", color: "#34d399", pitch: 50 },
  { id: "tom-m", label: "Tom Mid", color: "#10b981", pitch: 47 },
  { id: "rim", label: "Rim", color: "#f472b6", pitch: 37 },
];

export const BASS_ROWS: RowConfig[] = [
  { id: "bass-1", label: "Root", color: "#3b82f6", pitch: 36 },
  { id: "bass-2", label: "3rd", color: "#60a5fa", pitch: 40 },
  { id: "bass-3", label: "5th", color: "#93c5fd", pitch: 43 },
  { id: "bass-4", label: "7th", color: "#bfdbfe", pitch: 46 },
  { id: "bass-5", label: "Oct", color: "#1d4ed8", pitch: 48 },
];

export const MELODY_ROWS: RowConfig[] = [
  { id: "mel-1", label: "C4", color: "#a855f7", pitch: 60 },
  { id: "mel-2", label: "D4", color: "#c084fc", pitch: 62 },
  { id: "mel-3", label: "E4", color: "#d8b4fe", pitch: 64 },
  { id: "mel-4", label: "F4", color: "#9333ea", pitch: 65 },
  { id: "mel-5", label: "G4", color: "#7e22ce", pitch: 67 },
  { id: "mel-6", label: "A4", color: "#6b21a8", pitch: 69 },
  { id: "mel-7", label: "B4", color: "#581c87", pitch: 71 },
  { id: "mel-8", label: "C5", color: "#4c1d95", pitch: 72 },
];

export const AGENT_ROW_TEMPLATES: Record<string, RowConfig[]> = {
  drums: DRUM_ROWS,
  drum: DRUM_ROWS,
  percussion: DRUM_ROWS,
  bass: BASS_ROWS,
  melody: MELODY_ROWS,
  harmony: MELODY_ROWS,
};

export function createEmptySteps(rows: RowConfig[], stepCount: number): Record<string, StepData[]> {
  const steps: Record<string, StepData[]> = {};
  for (const row of rows) {
    steps[row.id] = Array.from({ length: stepCount }, () => ({ active: false, velocity: 0 }));
  }
  return steps;
}

export function resizeSteps(
  steps: Record<string, StepData[]>,
  rows: RowConfig[],
  newCount: number,
  oldCount: number
): Record<string, StepData[]> {
  const next: Record<string, StepData[]> = {};
  for (const row of rows) {
    const rowSteps = steps[row.id] ?? Array(oldCount).fill({ active: false, velocity: 0 });
    if (newCount <= rowSteps.length) {
      next[row.id] = rowSteps.slice(0, newCount);
    } else {
      const pad = Array.from({ length: newCount - rowSteps.length }, () => ({ active: false, velocity: 0 }));
      next[row.id] = [...rowSteps, ...pad];
    }
  }
  return next;
}
