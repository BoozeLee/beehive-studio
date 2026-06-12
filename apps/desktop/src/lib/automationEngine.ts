export interface AutomationPoint {
  time: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  trackId: string;
  parameter: string;
  points: AutomationPoint[];
  mode: "off" | "read" | "touch" | "write";
}

export function interpolateAutomation(
  points: AutomationPoint[],
  time: number
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  const sorted = [...points].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time)
    return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const t =
        (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
      return sorted[i].value + t * (sorted[i + 1].value - sorted[i].value);
    }
  }

  return sorted[sorted.length - 1].value;
}

export function createAutomationLane(
  trackId: string,
  parameter: string
): AutomationLane {
  return {
    id: crypto.randomUUID(),
    trackId,
    parameter,
    points: [],
    mode: "off",
  };
}

export function addAutomationPoint(
  lane: AutomationLane,
  time: number,
  value: number
): AutomationLane {
  const existing = lane.points.find((p) => Math.abs(p.time - time) < 0.01);
  if (existing) {
    return {
      ...lane,
      points: lane.points.map((p) =>
        Math.abs(p.time - time) < 0.01 ? { ...p, value } : p
      ),
    };
  }
  const newPoints = [...lane.points, { time, value }].sort(
    (a, b) => a.time - b.time
  );
  return { ...lane, points: newPoints };
}

export function removeAutomationPoint(
  lane: AutomationLane,
  time: number
): AutomationLane {
  return {
    ...lane,
    points: lane.points.filter((p) => Math.abs(p.time - time) >= 0.01),
  };
}

export function automationValuesAtBeat(
  lanes: Array<Pick<AutomationLane, "parameter" | "points" | "mode">>,
  beat: number
): Record<string, number> {
  return Object.fromEntries(
    lanes
      .filter((lane) => lane.mode !== "off" && lane.points.length > 0)
      .map((lane) => [lane.parameter, interpolateAutomation(lane.points, beat)])
  );
}

export const AUTOMATABLE_PARAMS = [
  "volume",
  "pan",
  "filter.cutoff",
  "filter.Q",
  "reverb.wet",
  "delay.wet",
  "distortion.wet",
] as const;

export type AutomatableParam = (typeof AUTOMATABLE_PARAMS)[number];

export const PARAM_RANGES: Record<
  string,
  { min: number; max: number; default: number; unit: string }
> = {
  volume: { min: 0, max: 1, default: 0.8, unit: "" },
  pan: { min: -1, max: 1, default: 0, unit: "" },
  "filter.cutoff": { min: 20, max: 20000, default: 1000, unit: "Hz" },
  "filter.Q": { min: 0.1, max: 20, default: 1, unit: "" },
  "reverb.wet": { min: 0, max: 1, default: 0.5, unit: "" },
  "delay.wet": { min: 0, max: 1, default: 0.5, unit: "" },
  "distortion.wet": { min: 0, max: 1, default: 0.5, unit: "" },
};
