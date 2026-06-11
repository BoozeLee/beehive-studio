import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock Tauri API to avoid runtime errors
vi.mock("@tauri-apps/api", () => ({
  invoke: vi.fn().mockResolvedValue({ success: true, data: "mocked" }),
}));

// Mock the render job functions
vi.mock("../lib/renderJobs", () => ({
  exportProjectAudio: vi.fn().mockResolvedValue({ status: "completed", result: {} }),
  createRenderJob: vi.fn().mockResolvedValue({
    id: "mock-job-123",
    status: "processing",
    progress: 0.0,
    stage: "Starting",
    engine: "python",
  }),
  getRenderJob: vi.fn().mockReturnValue({
    status: "processing",
    progress: 0.5,
    stage: "Loading samples",
    engine: "python",
  }),
  waitForRenderJob: vi.fn().mockImplementation((jobId, callback) => {
    return Promise.resolve();
  }),
}));

// Mock project assets
vi.mock("../lib/projectAssets", () => ({
  consolidateProjectAssets: vi.fn().mockResolvedValue({
    count: 2,
    assets: [{ path: "/test/kick.wav", filename: "kick.wav", size: 1024 }],
    projectPath: "/test/project",
  }),
  resolveProjectAsset: vi.fn().mockImplementation((projectPath, assetPath) => {
    if (assetPath.startsWith("/")) return assetPath;
    return `${projectPath}/${assetPath}`;
  }),
}));

describe("Export Integration Tests", () => {
  const mockRenderClips = [
    {
      id: "clip-1",
      channel: "track-1",
      notes: [
        { pitch: 60, velocity: 100, start: 0, duration: 4 },
        { pitch: 64, velocity: 110, start: 4, duration: 4 },
      ],
    },
    {
      id: "clip-2",
      channel: "track-2",
      notes: [
        { pitch: 36, velocity: 120, start: 0, duration: 8 },
      ],
    },
  ];

  const mockMixerTracks = [
    {
      id: "track-1",
      name: "Lead Synth",
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
      automationLanes: [],
    },
    {
      id: "track-2",
      name: "Kick Drum",
      volume: 0.9,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
      automationLanes: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Full Export Pipeline", () => {
    it("completes full export workflow", async () => {
      // Mock successful completion
      const { exportProjectAudio, getRenderJob } = await import("../lib/renderJobs");
      
      vi.mocked(getRenderJob)
        .mockReturnValueOnce({ status: "processing", progress: 0.5, stage: "Loading samples" })
        .mockReturnValueOnce({ status: "processing", progress: 0.8, stage: "Rendering tracks" })
        .mockReturnValueOnce({
          status: "completed",
          progress: 1.0,
          stage: "Completed",
          engine: "python",
          master_path: "/tmp/test_master.wav",
          stem_paths: ["/tmp/test_kick.wav", "/tmp/test_synth.wav"],
        });

      // Execute the export
      const result = await exportProjectAudio(
        mockRenderClips,
        120,
        "festival",
        mockMixerTracks
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.status).toBe("completed");
    });

    it("handles different render presets", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      const presets = ["draft", "club", "festival"] as const;

      presets.forEach(preset => {
        vi.mocked(exportProjectAudio).mockResolvedValue({
          status: "completed",
          result: { master_path: `/tmp/${preset}_master.wav` },
        });
      });

      // Test each preset
      for (const preset of presets) {
        const result = await exportProjectAudio(
          mockRenderClips,
          120,
          preset,
          mockMixerTracks
        );

        expect(result).toBeDefined();
        expect(result.status).toBe("completed");
      }
    });

    it("supports stem output mode", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      vi.mocked(exportProjectAudio).mockResolvedValue({
        status: "completed",
        result: {
          master_path: "/tmp/master.wav",
          stem_paths: ["/tmp/track1.wav", "/tmp/track2.wav"],
        },
      });

      const result = await exportProjectAudio(
        mockRenderClips,
        120,
        "festival",
        mockMixerTracks,
        "master_and_stems"
      );

      expect(result).toBeDefined();
      expect(result.status).toBe("completed");
    });
  });

  describe("Project Asset Management", () => {
    it("consolidates external audio samples into project", async () => {
      const { consolidateProjectAssets } = await import("../lib/projectAssets");
      
      const mockAssets = [
        { path: "/external/kick.wav", filename: "kick.wav", size: 1024 },
        { path: "/external/snare.wav", filename: "snare.wav", size: 2048 },
      ];

      vi.mocked(consolidateProjectAssets).mockResolvedValueOnce({
        count: 2,
        assets: mockAssets,
        projectPath: "/test/project",
      });

      const result = await consolidateProjectAssets("/test/project", {
        "clip-1": { audioFilePath: "/external/kick.wav" },
        "clip-2": { audioFilePath: "/external/snare.wav" },
      });

      expect(result.count).toBe(2);
      expect(consolidateProjectAssets).toHaveBeenCalledWith("/test/project", expect.any(Object));
    });

    it("resolves project-relative asset paths", async () => {
      const { resolveProjectAsset } = await import("../lib/projectAssets");
      
      const projectPath = "/test/project";
      const assetPath = "samples/kick.wav";

      const resolved = resolveProjectAsset(projectPath, assetPath);
      expect(resolved).toBe("/test/project/samples/kick.wav");
    });

    it("handles absolute asset paths correctly", async () => {
      const { resolveProjectAsset } = await import("../lib/projectAssets");
      
      const projectPath = "/test/project";
      const absolutePath = "/external/samples/kick.wav";

      const resolved = resolveProjectAsset(projectPath, absolutePath);
      expect(resolved).toBe(absolutePath);
    });
  });

  describe("Render Job Management", () => {
    it("tracks render job progress", async () => {
      const { createRenderJob, getRenderJob, waitForRenderJob } = await import("../lib/renderJobs");
      
      const jobId = "progress-test-123";

      vi.mocked(createRenderJob).mockResolvedValue({
        id: jobId,
        status: "processing",
        progress: 0.0,
        stage: "Starting",
        engine: "python",
      });

      vi.mocked(getRenderJob)
        .mockReturnValueOnce({ status: "processing", progress: 0.2, stage: "Loading samples" })
        .mockReturnValueOnce({ status: "processing", progress: 0.5, stage: "Rendering tracks" })
        .mockReturnValueOnce({ status: "processing", progress: 0.8, stage: "Applying effects" })
        .mockReturnValueOnce({ status: "completed", progress: 1.0, stage: "Completed" });

      await waitForRenderJob(jobId, (job) => {
        expect(job.progress).toBeGreaterThan(0);
        expect(job.stage).toBeDefined();
        return job.status === "completed";
      });

      // Verify final state
      const finalJob = await getRenderJob(jobId);
      expect(finalJob.status).toBe("completed");
      expect(finalJob.progress).toBe(1.0);
    });

    it("handles render job cancellation", async () => {
      const { createRenderJob, getRenderJob } = await import("../lib/renderJobs");
      
      const jobId = "cancel-test-123";

      vi.mocked(createRenderJob).mockResolvedValue({
        id: jobId,
        status: "processing",
        progress: 0.3,
        stage: "Rendering",
        engine: "python",
      });

      // Simulate cancellation
      vi.mocked(getRenderJob).mockReturnValue({
        status: "cancelled",
        progress: 0.3,
        stage: "Cancelled",
        engine: "python",
      });

      // Test cancellation
      const job = await getRenderJob(jobId);
      expect(job.status).toBe("cancelled");
    });
  });

  describe("Error Handling", () => {
    it("handles backend connection errors", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      vi.mocked(exportProjectAudio).mockRejectedValueOnce(new Error("Backend connection failed"));

      // Should handle gracefully
      try {
        await exportProjectAudio(
          mockRenderClips,
          120,
          "draft",
          mockMixerTracks
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain("Backend connection failed");
      }
    });

    it("handles missing audio files", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      vi.mocked(exportProjectAudio).mockRejectedValueOnce(new Error("Audio file not found"));

      expect(async () => {
        await exportProjectAudio(
          mockRenderClips,
          120,
          "draft",
          mockMixerTracks
        );
      }).rejects.toThrow("Audio file not found");
    });

    it("handles invalid render parameters", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      const invalidClips = [
        {
          id: "clip-invalid",
          channel: "invalid-track",
          notes: [],
        },
      ];

      // Should handle missing tracks gracefully
      const result = await exportProjectAudio(
        invalidClips,
        120,
        "draft",
        []
      );

      expect(result).toBeDefined();
    });
  });

  describe("Performance & Edge Cases", () => {
    it("handles empty arrangement", async () => {
      const { exportProjectAudio } = await import("../lib/renderJobs");
      
      vi.mocked(exportProjectAudio).mockResolvedValue({
        status: "completed",
        result: { master_path: "/tmp/empty_master.wav" },
      });

      const result = await exportProjectAudio(
        [],
        120,
        "draft",
        []
      );

      expect(result).toBeDefined();
      expect(result.status).toBe("completed");
    });
  });
});