import { describe, expect, it } from "vitest";
import { automationValuesAtBeat, interpolateAutomation } from "../lib/automationEngine";

describe("automation engine", () => {
  it("interpolates values and routes every active parameter by identifier", () => {
    const lanes = [
      {
        parameter: "volume",
        mode: "read" as const,
        points: [{ time: 0, value: 0 }, { time: 4, value: 1 }],
      },
      {
        parameter: "fx.fx-1.frequency",
        mode: "read" as const,
        points: [{ time: 0, value: 400 }, { time: 4, value: 1200 }],
      },
      {
        parameter: "pan",
        mode: "off" as const,
        points: [{ time: 0, value: -1 }],
      },
    ];

    expect(interpolateAutomation(lanes[0].points, 2)).toBe(0.5);
    expect(automationValuesAtBeat(lanes, 2)).toEqual({
      volume: 0.5,
      "fx.fx-1.frequency": 800,
    });
  });
});
