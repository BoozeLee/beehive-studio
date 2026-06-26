import { describe, it, expect } from "vitest";
import type { MidiNote } from "../../../../packages/core-models/index";
import {
  constrainToScale,
  generateChords,
  arpeggiate,
  applyGroove,
  quantizeNotes,
  SCALE_INTERVALS,
  KEY_ROOTS,
} from "../lib/musicTheory";

const n = (pitch: number, start = 0, duration = 1, velocity = 100): MidiNote => ({
  pitch,
  velocity,
  start,
  duration,
});

function inScale(pitch: number, key: string, scale: string): boolean {
  const root = KEY_ROOTS[key];
  const pcs = new Set(SCALE_INTERVALS[scale].map((i) => (root + i) % 12));
  return pcs.has(((pitch % 12) + 12) % 12);
}

describe("musicTheory", () => {
  it("constrainToScale snaps every note into the scale, preserving count", () => {
    const notes = [n(60), n(61), n(66), n(70)]; // C, C#, F#, A#
    const out = constrainToScale(notes, "C", "minor");
    expect(out).toHaveLength(4);
    for (const note of out) expect(inScale(note.pitch, "C", "minor")).toBe(true);
  });

  it("generateChords harmonizes a root with diatonic 3rd + 5th in scale", () => {
    const out = generateChords([n(60)], "C", "minor", "triad");
    expect(out).toHaveLength(3); // root + 3rd + 5th
    for (const note of out) expect(inScale(note.pitch, "C", "minor")).toBe(true);
    // seventh voicing adds a 4th tone
    expect(generateChords([n(60)], "C", "minor", "seventh")).toHaveLength(4);
  });

  it("arpeggiate spreads a simultaneous chord across time", () => {
    const chord = [n(60, 0), n(63, 0), n(67, 0)];
    const out = arpeggiate(chord, "up", 0.25);
    expect(out).toHaveLength(3);
    const starts = out.map((x) => x.start).sort((a, b) => a - b);
    expect(starts).toEqual([0, 0.25, 0.5]);
    expect(out.map((x) => x.pitch).sort((a, b) => a - b)).toEqual([60, 63, 67]);
  });

  it("quantizeNotes snaps starts to the grid", () => {
    const out = quantizeNotes([n(60, 0.31, 0.4), n(62, 0.62, 0.2)], 0.25);
    expect(out[0].start).toBeCloseTo(0.25);
    expect(out[1].start).toBeCloseTo(0.5);
    expect(out[0].duration).toBeGreaterThanOrEqual(0.25);
  });

  it("applyGroove returns notes within valid velocity range", () => {
    const out = applyGroove([n(60, 0), n(62, 0.5), n(64, 1)], { swing: 0.6, darkness: 0.3 });
    expect(out.length).toBeGreaterThan(0);
    for (const note of out) {
      expect(note.velocity).toBeGreaterThanOrEqual(1);
      expect(note.velocity).toBeLessThanOrEqual(127);
    }
  });
});
