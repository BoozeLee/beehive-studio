import { describe, it, expect } from "vitest";
import type { ClipData } from "./db";

describe("ClipData interface", () => {
  it("can create a minimal ClipData", () => {
    const clip: ClipData = {
      id: "clip-1",
      name: "test clip",
    };
    expect(clip.id).toBe("clip-1");
    expect(clip.name).toBe("test clip");
  });

  it("can create a ClipData with midi notes", () => {
    const clip: ClipData = {
      id: "clip-2",
      name: "bass line",
      midiData: {
        notes: [
          { pitch: 36, velocity: 100, start: 0, duration: 1 },
          { pitch: 40, velocity: 80, start: 1, duration: 0.5 },
          { pitch: 43, velocity: 90, start: 2, duration: 0.75 },
        ],
      },
    };
    expect(clip.midiData?.notes).toHaveLength(3);
    expect(clip.midiData?.notes[0].pitch).toBe(36);
  });

  it("can create a ClipData with reasoning", () => {
    const clip: ClipData = {
      id: "clip-3",
      name: "generated melody",
      reasoning: ["Step 1: Analyze key", "Step 2: Generate notes", "Step 3: Apply style"],
    };
    expect(clip.reasoning).toHaveLength(3);
    expect(clip.reasoning?.[0]).toBe("Step 1: Analyze key");
  });

  it("can create a ClipData with optional fields", () => {
    const clip: ClipData = {
      id: "clip-4",
      name: "full clip",
      duration: 8,
      color: "#ff8c42",
    };
    expect(clip.duration).toBe(8);
    expect(clip.color).toBe("#ff8c42");
  });
});

describe("ClipData MIDI data manipulation", () => {
  it("can add notes to clip", () => {
    const clip: ClipData = {
      id: "clip-5",
      name: "rhythm",
      midiData: { notes: [] },
    };
    clip.midiData!.notes.push(
      { pitch: 42, velocity: 100, start: 0, duration: 0.25 },
      { pitch: 42, velocity: 100, start: 0.5, duration: 0.25 },
      { pitch: 46, velocity: 90, start: 1, duration: 0.25 },
    );
    expect(clip.midiData!.notes).toHaveLength(3);
  });

  it("can compute total duration from notes", () => {
    const clip: ClipData = {
      id: "clip-6",
      name: "long clip",
      midiData: {
        notes: [
          { pitch: 60, velocity: 100, start: 0, duration: 2 },
          { pitch: 64, velocity: 80, start: 2, duration: 4 },
          { pitch: 67, velocity: 90, start: 6, duration: 2 },
        ],
      },
    };
    const maxEnd = Math.max(
      ...clip.midiData!.notes.map((n) => n.start + n.duration)
    );
    expect(maxEnd).toBe(8);
  });
});

describe("ClipData serialization round-trip", () => {
  it("notes survive JSON round-trip", () => {
    const original: ClipData = {
      id: "clip-7",
      name: "test",
      midiData: {
        notes: [
          { pitch: 60, velocity: 100, start: 0, duration: 1 },
        ],
      },
    };
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as ClipData;
    expect(parsed.id).toBe(original.id);
    expect(parsed.midiData?.notes[0].pitch).toBe(60);
  });

  it("reasoning survives JSON round-trip", () => {
    const original: ClipData = {
      id: "clip-8",
      name: "test",
      reasoning: ["reason A", "reason B"],
    };
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as ClipData;
    expect(parsed.reasoning).toEqual(["reason A", "reason B"]);
  });
});
