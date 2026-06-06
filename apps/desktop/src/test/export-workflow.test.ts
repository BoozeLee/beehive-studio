import { describe, expect, it } from "vitest";
import type { RenderClip } from "../lib/audioEngine";
import {
  formatRenderDuration,
  RENDER_PRESETS,
  summarizeRender,
} from "../lib/exportWorkflow";

describe("export workflow", () => {
  it("summarizes arrangement clips, tracks, notes, and tail duration", () => {
    const clips: RenderClip[] = [
      {
        id: "clip-1",
        channel: "track-1",
        notes: [{ pitch: 60, velocity: 100, start: 8, duration: 2 }],
      },
      {
        id: "clip-2",
        channel: "track-2",
        notes: [
          { pitch: 36, velocity: 110, start: 0, duration: 0.5 },
          { pitch: 38, velocity: 90, start: 12, duration: 1 },
        ],
      },
    ];

    expect(summarizeRender(clips, 120)).toEqual({
      clipCount: 2,
      trackCount: 2,
      noteCount: 3,
      totalBeats: 13,
      durationSeconds: 7.5,
    });
  });

  it("returns an empty summary for an empty arrangement", () => {
    expect(summarizeRender([], 120)).toEqual({
      clipCount: 0,
      trackCount: 0,
      noteCount: 0,
      totalBeats: 0,
      durationSeconds: 0,
    });
  });

  it("exposes the intended mastering targets and formats duration", () => {
    expect(RENDER_PRESETS.draft.targetLufs).toBe(-14);
    expect(RENDER_PRESETS.club.targetLufs).toBe(-9.5);
    expect(RENDER_PRESETS.festival.targetLufs).toBe(-7.5);
    expect(formatRenderDuration(125.4)).toBe("2:05");
  });
});
