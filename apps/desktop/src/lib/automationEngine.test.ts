import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  interpolateAutomation,
  createAutomationLane,
  addAutomationPoint,
  removeAutomationPoint,
  registerAutomationTarget,
  unregisterAutomationTarget,
  applyAutomationAtBeat,
  AUTOMATABLE_PARAMS,
} from "./automationEngine";

describe("interpolateAutomation", () => {
  it("returns 0 for empty points", () => {
    expect(interpolateAutomation([], 0)).toBe(0);
  });

  it("returns the only point value for single point", () => {
    expect(interpolateAutomation([{ time: 0, value: 0.8 }], 0)).toBe(0.8);
  });

  it("returns first value when time is before first point", () => {
    const points = [
      { time: 2, value: 0.5 },
      { time: 4, value: 1.0 },
    ];
    expect(interpolateAutomation(points, 0)).toBe(0.5);
  });

  it("returns last value when time is after last point", () => {
    const points = [
      { time: 2, value: 0.5 },
      { time: 4, value: 1.0 },
    ];
    expect(interpolateAutomation(points, 10)).toBe(1.0);
  });

  it("linearly interpolates between two points", () => {
    const points = [
      { time: 0, value: 0 },
      { time: 4, value: 1 },
    ];
    expect(interpolateAutomation(points, 2)).toBeCloseTo(0.5, 5);
  });

  it("interpolates at quarter positions", () => {
    const points = [
      { time: 0, value: 0 },
      { time: 4, value: 1 },
    ];
    expect(interpolateAutomation(points, 1)).toBeCloseTo(0.25, 5);
    expect(interpolateAutomation(points, 3)).toBeCloseTo(0.75, 5);
  });

  it("handles unsorted points", () => {
    const points = [
      { time: 4, value: 1 },
      { time: 0, value: 0 },
    ];
    expect(interpolateAutomation(points, 2)).toBeCloseTo(0.5, 5);
  });

  it("returns exact value at point times", () => {
    const points = [
      { time: 0, value: 0.2 },
      { time: 2, value: 0.8 },
      { time: 4, value: 0.5 },
    ];
    expect(interpolateAutomation(points, 0)).toBe(0.2);
    expect(interpolateAutomation(points, 2)).toBe(0.8);
    expect(interpolateAutomation(points, 4)).toBe(0.5);
  });
});

describe("createAutomationLane", () => {
  it("creates a lane with given track and parameter", () => {
    const lane = createAutomationLane("track-1", "volume");
    expect(lane.trackId).toBe("track-1");
    expect(lane.parameter).toBe("volume");
    expect(lane.mode).toBe("off");
    expect(lane.points).toEqual([]);
    expect(lane.id).toBeDefined();
  });
});

describe("addAutomationPoint", () => {
  it("adds a new point to empty lane", () => {
    const lane = createAutomationLane("track-1", "volume");
    const updated = addAutomationPoint(lane, 2, 0.8);
    expect(updated.points).toHaveLength(1);
    expect(updated.points[0]).toEqual({ time: 2, value: 0.8 });
  });

  it("updates existing point at same time", () => {
    let lane = createAutomationLane("track-1", "volume");
    lane = addAutomationPoint(lane, 2, 0.5);
    lane = addAutomationPoint(lane, 2, 0.9);
    expect(lane.points).toHaveLength(1);
    expect(lane.points[0].value).toBe(0.9);
  });

  it("maintains sorted order", () => {
    let lane = createAutomationLane("track-1", "volume");
    lane = addAutomationPoint(lane, 4, 1.0);
    lane = addAutomationPoint(lane, 0, 0.0);
    lane = addAutomationPoint(lane, 2, 0.5);
    expect(lane.points.map((p) => p.time)).toEqual([0, 2, 4]);
  });
});

describe("removeAutomationPoint", () => {
  it("removes a point at the given time", () => {
    let lane = createAutomationLane("track-1", "volume");
    lane = addAutomationPoint(lane, 2, 0.5);
    lane = addAutomationPoint(lane, 4, 0.8);
    lane = removeAutomationPoint(lane, 2);
    expect(lane.points).toHaveLength(1);
    expect(lane.points[0].time).toBe(4);
  });

  it("does nothing for non-existent time", () => {
    let lane = createAutomationLane("track-1", "volume");
    lane = addAutomationPoint(lane, 2, 0.5);
    lane = removeAutomationPoint(lane, 10);
    expect(lane.points).toHaveLength(1);
  });
});

describe("registerAutomationTarget", () => {
  beforeEach(() => {
    // Register a test target
    registerAutomationTarget("volume", {
      set: vi.fn(),
    });
  });

  afterEach(() => {
    unregisterAutomationTarget("volume");
  });

  it("applyAutomationAtBeat calls registered target", () => {
    const setter = vi.fn();
    registerAutomationTarget("test-param", { set: setter });

    const lane = createAutomationLane("track-1", "test-param");
    const updated = addAutomationPoint(lane, 0, 0.5);
    updated.mode = "read";

    applyAutomationAtBeat([updated], 2, 1000);

    expect(setter).toHaveBeenCalledWith(0.5, 1000);
    unregisterAutomationTarget("test-param");
  });

  it("skips lanes in off mode", () => {
    const setter = vi.fn();
    registerAutomationTarget("test-param-off", { set: setter });

    const lane = createAutomationLane("track-1", "test-param-off");
    const updated = addAutomationPoint(lane, 0, 0.5);
    updated.mode = "off"; // explicitly off

    applyAutomationAtBeat([updated], 2, 1000);

    expect(setter).not.toHaveBeenCalled();
    unregisterAutomationTarget("test-param-off");
  });

  it("skips lanes with no points", () => {
    const setter = vi.fn();
    registerAutomationTarget("test-param-empty", { set: setter });

    const lane = createAutomationLane("track-1", "test-param-empty");
    lane.mode = "read";

    applyAutomationAtBeat([lane], 2, 1000);

    expect(setter).not.toHaveBeenCalled();
    unregisterAutomationTarget("test-param-empty");
  });
});

describe("AUTOMATABLE_PARAMS", () => {
  it("includes standard mix parameters", () => {
    expect(AUTOMATABLE_PARAMS).toContain("volume");
    expect(AUTOMATABLE_PARAMS).toContain("pan");
    expect(AUTOMATABLE_PARAMS).toContain("filter.cutoff");
    expect(AUTOMATABLE_PARAMS).toContain("reverb.wet");
    expect(AUTOMATABLE_PARAMS).toContain("delay.wet");
    expect(AUTOMATABLE_PARAMS).toContain("distortion.wet");
  });
});
