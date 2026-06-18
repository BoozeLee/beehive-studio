import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "../projectStore";
import type { BuildJob } from "../../../../src/services/types";

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState?.() ?? { project: null, clips: [], tracks: [], buildJobs: [], activeBuildId: undefined, tasteNodes: [], tasteEdges: [] });
  });

  it("sets project and tracks/clips", () => {
    const project = {
      id: "p1",
      name: "Test",
      rootUri: "file:///test",
      bpm: 128,
      timeSignature: [4, 4] as [number, number],
      activeBranchId: "main",
      branches: {},
      createdAt: 1,
      updatedAt: 1,
    };
    useProjectStore.getState().setProject(project);
    expect(useProjectStore.getState().project).toEqual(project);
  });

  it("adds and updates clips", () => {
    const clip = { id: "c1", name: "Clip 1", type: "midi" as const, trackId: "t1", start: 0, duration: 4, loop: false };
    useProjectStore.getState().addClip(clip);
    expect(useProjectStore.getState().clips).toHaveLength(1);

    useProjectStore.getState().updateClip({ ...clip, name: "Updated" });
    expect(useProjectStore.getState().clips[0].name).toBe("Updated");
  });

  it("adds build jobs and marks active", () => {
    const job: BuildJob = {
      id: "b1",
      projectId: "p1",
      plan: { id: "plan1", summary: "", projectRevision: 0, proposedPatches: [], executionSteps: [], warnings: [], confidence: {}, attribution: {}, degraded: false },
      status: "running",
      progress: 0.5,
      artifacts: [],
    };
    useProjectStore.getState().addBuildJob(job);
    expect(useProjectStore.getState().buildJobs).toContainEqual(job);
    expect(useProjectStore.getState().activeBuildId).toBe("b1");
  });

  it("updates build job from event", () => {
    const job: BuildJob = {
      id: "b1",
      projectId: "p1",
      plan: { id: "plan1", summary: "", projectRevision: 0, proposedPatches: [], executionSteps: [], warnings: [], confidence: {}, attribution: {}, degraded: false },
      status: "running",
      progress: 0.2,
      artifacts: [],
    };
    useProjectStore.getState().addBuildJob(job);

    useProjectStore.getState().updateBuildJobFromEvent({
      type: "progress",
      projectId: "p1",
      buildId: "b1",
      sourceService: "gateway",
      payload: { progress: 0.8, status: "completed" },
      timestamp: Date.now(),
    });

    const updated = useProjectStore.getState().buildJobs[0];
    expect(updated.progress).toBe(0.8);
    expect(updated.status).toBe("completed");
  });

  it("creates a build job from event when unknown", () => {
    useProjectStore.getState().updateBuildJobFromEvent({
      type: "progress",
      projectId: "p1",
      buildId: "b2",
      sourceService: "gateway",
      payload: { progress: 0.1, status: "running" },
      timestamp: Date.now(),
    });

    const jobs = useProjectStore.getState().buildJobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("b2");
  });
});
