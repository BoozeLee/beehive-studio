import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BuildPlanReview } from "../components/BuildPlanReview/BuildPlanReview";
import type { BuildJob } from "../../../../packages/core-models/index";

const job: BuildJob = {
  id: "build-1",
  projectId: "ritual",
  status: "awaiting_approval",
  progress: 0,
  artifacts: [],
  plan: {
    id: "plan-1",
    summary: "Compile approved ritual arrangement.",
    projectRevision: 3,
    proposedPatches: [],
    executionSteps: [{ id: "compile", kind: "compile", label: "Compile" }],
    warnings: ["Hive is degraded"],
    confidence: { overall: 0.5 },
    attribution: {},
    degraded: true,
  },
};

describe("BuildPlanReview", () => {
  it("shows plan safety state and requires an explicit approval action", () => {
    const approve = vi.fn();
    const reject = vi.fn();
    render(
      <BuildPlanReview
        job={job}
        loading={false}
        error={null}
        onApprove={approve}
        onReject={reject}
      />,
    );

    expect(screen.getByText("Compile approved ritual arrangement.")).toBeInTheDocument();
    expect(screen.getAllByText(/degraded/)).toHaveLength(2);
    fireEvent.click(screen.getByText("Approve & Build"));
    fireEvent.click(screen.getByText("Reject"));
    expect(approve).toHaveBeenCalledOnce();
    expect(reject).toHaveBeenCalledOnce();
  });
});
