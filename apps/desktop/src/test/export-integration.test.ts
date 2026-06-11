import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  consolidateProjectAssets,
  resolveProjectAsset,
} from "../lib/projectAssets";
import {
  cancelRenderJob,
  createRenderJob,
  getRenderJob,
  waitForRenderJob,
  type RenderJob,
} from "../lib/renderJobs";

const runningJob: RenderJob = {
  id: "render-123",
  status: "running",
  progress: 0.5,
  stage: "Rendering tracks",
  engine: "python",
};

const completedJob: RenderJob = {
  ...runningJob,
  status: "completed",
  progress: 1,
  stage: "Completed",
  master_path: "/tmp/master.wav",
  stem_paths: ["/tmp/lead.wav"],
};

describe("Export integration contracts", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("creates a render job using the current backend request contract", async () => {
    invoke.mockResolvedValueOnce(runningJob);

    await expect(
      createRenderJob([], [], 124, "festival", "master_and_stems"),
    ).resolves.toEqual(runningJob);
    expect(invoke).toHaveBeenCalledWith("backend_request", {
      method: "POST",
      endpoint: "render/jobs",
      body: {
        clips: [],
        tracks: [],
        bpm: 124,
        preset: "festival",
        output_mode: "master_and_stems",
      },
    });
  });

  it("gets and cancels render jobs through their lifecycle endpoints", async () => {
    invoke.mockResolvedValueOnce(runningJob).mockResolvedValueOnce({
      ...runningJob,
      status: "cancelled",
      stage: "Cancelled",
    });

    await expect(getRenderJob(runningJob.id)).resolves.toEqual(runningJob);
    await expect(cancelRenderJob(runningJob.id)).resolves.toMatchObject({
      status: "cancelled",
    });
    expect(invoke).toHaveBeenNthCalledWith(1, "backend_request", {
      method: "GET",
      endpoint: `render/jobs/${runningJob.id}`,
      body: null,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "backend_request", {
      method: "DELETE",
      endpoint: `render/jobs/${runningJob.id}`,
      body: null,
    });
  });

  it("polls until a render completes and reports progress", async () => {
    invoke.mockResolvedValueOnce(runningJob).mockResolvedValueOnce(completedJob);
    const progress = vi.fn();

    await expect(waitForRenderJob(runningJob.id, progress, 0)).resolves.toEqual(
      completedJob,
    );
    expect(progress).toHaveBeenNthCalledWith(1, runningJob);
    expect(progress).toHaveBeenNthCalledWith(2, completedJob);
  });

  it("rejects failed and cancelled render jobs", async () => {
    invoke.mockResolvedValueOnce({
      ...runningJob,
      status: "failed",
      error: "Audio file not found",
    });

    await expect(waitForRenderJob(runningJob.id, vi.fn(), 0)).rejects.toThrow(
      "Audio file not found",
    );
  });

  it("resolves project assets through the native project boundary", async () => {
    invoke.mockResolvedValueOnce("/projects/demo/assets/kick.wav");

    await expect(
      resolveProjectAsset("demo", "assets/kick.wav"),
    ).resolves.toBe("/projects/demo/assets/kick.wav");
    expect(invoke).toHaveBeenCalledWith("resolve_project_asset", {
      projectName: "demo",
      path: "assets/kick.wav",
    });
  });

  it("consolidates only absolute assets and relinks returned paths", async () => {
    invoke.mockResolvedValueOnce({
      "/external/kick.wav": "assets/kick.wav",
    });
    const clips = {
      external: {
        id: "external",
        trackId: "drums",
        name: "Kick",
        startBeat: 0,
        lengthBeats: 4,
        audioFilePath: "/external/kick.wav",
      },
      local: {
        id: "local",
        trackId: "drums",
        name: "Snare",
        startBeat: 4,
        lengthBeats: 4,
        audioFilePath: "assets/snare.wav",
      },
    } as const;

    const result = await consolidateProjectAssets("demo", clips);

    expect(result.count).toBe(1);
    expect(result.clips.external.audioFilePath).toBe("assets/kick.wav");
    expect(result.clips.local).toBe(clips.local);
    expect(invoke).toHaveBeenCalledWith("consolidate_project_assets", {
      projectName: "demo",
      paths: ["/external/kick.wav"],
    });
  });

  it("avoids a native call when no external assets need consolidation", async () => {
    const clips = {
      local: {
        id: "local",
        trackId: "drums",
        name: "Snare",
        startBeat: 0,
        lengthBeats: 4,
        audioFilePath: "assets/snare.wav",
      },
    } as const;

    await expect(consolidateProjectAssets("demo", clips)).resolves.toEqual({
      clips,
      count: 0,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
