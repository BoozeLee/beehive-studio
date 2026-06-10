import { describe, it, expect } from "vitest";
import {
  profilerStart,
  profilerEnd,
  profilerMeasure,
  profilerClear,
} from "./profiler";

describe("profiler", () => {
  it("measures a synchronous function", () => {
    const elapsed = profilerMeasure("render:wav", () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
    });
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it("start and end return null for invalid marks", () => {
    // Calling end without start should return null
    const result = profilerEnd("render:wav" as any);
    expect(result).toBeNull();
  });

  it("profilerClear does not throw", () => {
    expect(() => profilerClear()).not.toThrow();
  });

  it("can be called repeatedly", () => {
    profilerStart("agent:invoke");
    const elapsed = profilerEnd("agent:invoke");
    expect(elapsed).toBeGreaterThanOrEqual(0);

    profilerStart("agent:invoke");
    const elapsed2 = profilerEnd("agent:invoke");
    expect(elapsed2).toBeGreaterThanOrEqual(0);
  });

  it("tracks different mark types", () => {
    const marks = [
      "transport:tick",
      "render:offline",
      "render:wav",
      "render:flac",
      "render:mp3",
      "agent:invoke",
      "agent:response",
      "ui:render",
    ] as const;

    for (const mark of marks) {
      profilerStart(mark);
      const elapsed = profilerEnd(mark);
      expect(elapsed).toBeGreaterThanOrEqual(0);
    }
  });

  it("profilerClear resets all marks", () => {
    profilerStart("render:wav");
    const e1 = profilerEnd("render:wav");
    expect(e1).toBeGreaterThanOrEqual(0);

    profilerClear();

    // After clear, a mismatched end should return null
    const e2 = profilerEnd("render:wav" as any);
    expect(e2).toBeNull();
  });
});
