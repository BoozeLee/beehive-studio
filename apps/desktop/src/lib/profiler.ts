const PROFILING_ENABLED =
  typeof globalThis !== "undefined" &&
  "performance" in globalThis &&
  typeof performance.mark === "function";

export type ProfilerMark =
  | "transport:tick"
  | "transport:schedule"
  | "transport:noteTrigger"
  | "transport:automationApply"
  | "render:offline"
  | "render:wav"
  | "render:flac"
  | "render:mp3"
  | "agent:invoke"
  | "agent:response"
  | "ui:render";

const marks: Record<string, number> = {};

export function profilerStart(mark: ProfilerMark): void {
  if (!PROFILING_ENABLED) return;
  marks[mark] = performance.now();
  performance.mark(`${mark}:start`);
}

export function profilerEnd(mark: ProfilerMark): number | null {
  if (!PROFILING_ENABLED) return null;
  const start = marks[mark];
  if (start === undefined) return null;
  const elapsed = performance.now() - start;
  performance.mark(`${mark}:end`);
  performance.measure(mark, `${mark}:start`, `${mark}:end`);
  delete marks[mark];
  return elapsed;
}

export function profilerMeasure(mark: ProfilerMark, fn: () => void): number {
  profilerStart(mark);
  fn();
  return profilerEnd(mark) ?? 0;
}

export async function profilerMeasureAsync(
  mark: ProfilerMark,
  fn: () => Promise<void>
): Promise<number> {
  profilerStart(mark);
  await fn();
  return profilerEnd(mark) ?? 0;
}

export interface ProfilerReport {
  marks: Array<{ name: ProfilerMark; duration: number }>;
  total: number;
}

export function profilerGetReport(): ProfilerReport {
  if (!PROFILING_ENABLED) return { marks: [], total: 0 };
  const entries = performance.getEntriesByType("measure") as PerformanceMeasure[];
  const marks: ProfilerReport["marks"] = [];
  let total = 0;

  for (const entry of entries) {
    if (entry.name.startsWith("transport:") || entry.name.startsWith("render:") || entry.name.startsWith("agent:") || entry.name.startsWith("ui:")) {
      marks.push({ name: entry.name as ProfilerMark, duration: entry.duration });
      total += entry.duration;
    }
  }

  return { marks, total };
}

export function profilerClear(): void {
  if (!PROFILING_ENABLED) return;
  performance.clearMarks();
  performance.clearMeasures();
  Object.keys(marks).forEach((k) => delete marks[k]);
}
