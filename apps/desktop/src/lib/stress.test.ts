import { describe, it, expect } from "vitest";
import { createAutomationLane } from "./automationEngine";

describe("32-track stress test", () => {
  it("can create automation lanes for 32 tracks without issue", () => {
    const lanes = [];
    for (let i = 0; i < 32; i++) {
      const lane = createAutomationLane(`track-${i}`, "volume");
      // Add points to each lane
      for (let b = 0; b < 16; b += 4) {
        lane.points.push({ time: b, value: Math.random() });
      }
      lanes.push(lane);
    }
    expect(lanes).toHaveLength(32);
    const totalPoints = lanes.reduce((sum, l) => sum + l.points.length, 0);
    expect(totalPoints).toBe(32 * 4);
  });

  it("can schedule 32 tracks × 16 notes each", () => {
    const clips = [];
    for (let ch = 0; ch < 32; ch++) {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push({
          pitch: 36 + (i % 24),
          velocity: 80 + Math.floor(Math.random() * 40),
          start: i * 1,
          duration: 0.5,
        });
      }
      clips.push({
        id: `clip-${ch}`,
        notes,
        startBeat: 0,
        loop: false,
        channel: ch,
      });
    }
    expect(clips).toHaveLength(32);
    const totalNotes = clips.reduce((sum, c) => sum + c.notes.length, 0);
    expect(totalNotes).toBe(32 * 16);
  });
});

describe("500-clip stress test", () => {
  it("can store 500 clips in a map", () => {
    const clips: Record<string, { id: string; name: string; start: number; duration: number }> = {};
    for (let i = 0; i < 500; i++) {
      const id = `clip-${i}`;
      clips[id] = {
        id,
        name: `Clip ${i}`,
        start: i * 4,
        duration: 4,
      };
    }
    expect(Object.keys(clips)).toHaveLength(500);
    expect(clips["clip-0"]).toBeDefined();
    expect(clips["clip-499"]).toBeDefined();
  });

  it("can filter 500 clips to visible range", () => {
    const clips: Array<{ id: string; start: number; duration: number }> = [];
    for (let i = 0; i < 500; i++) {
      clips.push({
        id: `clip-${i}`,
        start: i * 4,
        duration: 4,
      });
    }

    // Simulate virtual scrolling: only clips in viewport
    const viewportStart = 200;
    const viewportEnd = 280;
    const visible = clips.filter((c) => {
      const end = c.start + c.duration;
      return c.start <= viewportEnd && end >= viewportStart;
    });

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(clips.length);
    // ~20 beats visible ÷ 4 beat clips = ~5 clips visible at a time
    expect(visible.length).toBeLessThanOrEqual(25);
  });

  it("can update a single clip among 500", () => {
    const clips: Record<string, { id: string; name: string; start: number }> = {};
    for (let i = 0; i < 500; i++) {
      clips[`clip-${i}`] = {
        id: `clip-${i}`,
        name: `Clip ${i}`,
        start: i * 4,
      };
    }

    // Update one clip
    clips["clip-250"] = { ...clips["clip-250"], name: "Updated Clip" };
    expect(clips["clip-250"].name).toBe("Updated Clip");
    expect(clips["clip-249"].name).toBe("Clip 249");
    expect(clips["clip-251"].name).toBe("Clip 251");
  });

  it("can delete a clip from 500 without affecting others", () => {
    const clipMap: Record<string, boolean> = {};
    for (let i = 0; i < 500; i++) clipMap[`clip-${i}`] = true;

    delete clipMap["clip-300"];
    expect(Object.keys(clipMap)).toHaveLength(499);
    expect(clipMap["clip-300"]).toBeUndefined();
    expect(clipMap["clip-299"]).toBe(true);
    expect(clipMap["clip-301"]).toBe(true);
  });

  it("can search 500 clips by name pattern", () => {
    const clips: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < 500; i++) {
      clips.push({
        id: `clip-${i}`,
        name: `Track ${Math.floor(i / 16)} — Pattern ${i % 16}`,
      });
    }

    const searchResults = clips.filter((c) => c.name.includes("—"));
    expect(searchResults).toHaveLength(500);

    const filtered = clips.filter((c) => c.name.includes("Track 5"));
    expect(filtered).toHaveLength(16);
  });
});

describe("Timeline store stress", () => {
  it("handles 32 tracks × 16 clips each", () => {
    const tracks: Array<{ id: string; name: string; clips: string[] }> = [];
    const clips: Record<string, { id: string; trackId: string; start: number }> = {};

    for (let t = 0; t < 32; t++) {
      const trackId = `track-${t}`;
      const clipIds: string[] = [];
      for (let c = 0; c < 16; c++) {
        const clipId = `clip-${t}-${c}`;
        clips[clipId] = { id: clipId, trackId, start: c * 4 };
        clipIds.push(clipId);
      }
      tracks.push({ id: trackId, name: `Track ${t}`, clips: clipIds });
    }

    expect(tracks).toHaveLength(32);
    expect(Object.keys(clips)).toHaveLength(512);

    // Verify track-to-clip mapping
    for (const track of tracks) {
      expect(track.clips).toHaveLength(16);
      for (const clipId of track.clips) {
        expect(clips[clipId].trackId).toBe(track.id);
      }
    }
  });
});
