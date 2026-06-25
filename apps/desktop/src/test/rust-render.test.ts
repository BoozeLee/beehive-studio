import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { renderOffline } from "../lib/rustRender";
import type { RenderClip, MixerTrackState } from "../lib/audioEngine";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("rustRender.renderOffline", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("invokes render_offline with the snake_case output_mode and returns paths", async () => {
    vi.mocked(invoke).mockResolvedValue({
      master_path: "/tmp/beehive-render-1/master.wav",
      stem_paths: ["/tmp/beehive-render-1/Bass.wav"],
      engine: "rust",
    });

    const clips: RenderClip[] = [
      { id: "c1", channel: "0", notes: [{ pitch: 45, velocity: 110, start: 0, duration: 1 }] },
    ];
    const tracks: MixerTrackState[] = [
      { id: "0", name: "Bass", volume: 0.8, pan: 0, muted: false, solo: false, instrument: "bass" },
    ];

    const result = await renderOffline(clips, tracks, 130, "festival", "flac", "master_and_stems");

    expect(invoke).toHaveBeenCalledWith("render_offline", {
      clips,
      tracks,
      bpm: 130,
      preset: "festival",
      format: "flac",
      output_mode: "master_and_stems",
    });
    expect(result.master_path).toContain("master.wav");
    expect(result.stem_paths).toHaveLength(1);
    expect(result.engine).toBe("rust");
  });
});
