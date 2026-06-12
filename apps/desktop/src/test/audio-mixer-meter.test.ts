import { describe, expect, it } from "vitest";
import { calculateRmsLevel, clampPan, clampUnit, decayPeak } from "../lib/audioMixer";

describe("audio mixer meter helpers", () => {
  it("returns zero RMS for centered silence", () => {
    expect(calculateRmsLevel(new Uint8Array([128, 128, 128, 128]))).toBe(0);
  });

  it("returns a higher RMS for non-centered waveform data", () => {
    expect(calculateRmsLevel(new Uint8Array([0, 128, 255, 128]))).toBeGreaterThan(0);
  });

  it("decays peak without dropping below current level", () => {
    expect(decayPeak(0.8, 0.2, 0.5)).toBe(0.4);
    expect(decayPeak(0.2, 0.6, 0.5)).toBe(0.6);
  });

  it("clamps unit and pan ranges", () => {
    expect(clampUnit(1.5)).toBe(1);
    expect(clampUnit(-1)).toBe(0);
    expect(clampPan(2)).toBe(1);
    expect(clampPan(-2)).toBe(-1);
  });
});
