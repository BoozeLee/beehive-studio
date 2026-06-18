import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BranchSelector } from "../BranchSelector";
import { useProjectStore } from "../../../stores/projectStore";

describe("BranchSelector", () => {
  it("renders main when no project", () => {
    useProjectStore.setState({ project: null });
    render(<BranchSelector />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("lists branches and switches active branch", () => {
    useProjectStore.setState({
      project: {
        id: "p1",
        name: "Test",
        rootUri: "file:///test",
        bpm: 120,
        timeSignature: [4, 4] as [number, number],
        activeBranchId: "main",
        branches: {
          main: { id: "main", parentId: null, name: "main", createdAt: 1, headCommit: "", status: "draft" as const, affectedClipIds: [] },
          feat: { id: "feat", parentId: "main", name: "feature", createdAt: 2, headCommit: "", status: "draft" as const, affectedClipIds: [] },
        },
        createdAt: 1,
        updatedAt: 1,
      },
    });

    const onChange = vi.fn();
    render(<BranchSelector onBranchChange={onChange} />);
    fireEvent.click(screen.getByText(/main/i));
    expect(screen.getByText("feature")).toBeInTheDocument();
    fireEvent.click(screen.getByText("feature"));
    expect(useProjectStore.getState().project?.activeBranchId).toBe("feat");
    expect(onChange).toHaveBeenCalledWith("feat");
  });

  it("creates a new branch", () => {
    useProjectStore.setState({
      project: {
        id: "p1",
        name: "Test",
        rootUri: "file:///test",
        bpm: 120,
        timeSignature: [4, 4] as [number, number],
        activeBranchId: "main",
        branches: {
          main: { id: "main", parentId: null, name: "main", createdAt: 1, headCommit: "", status: "draft" as const, affectedClipIds: [] },
        },
        createdAt: 1,
        updatedAt: 1,
      },
    });

    render(<BranchSelector />);
    fireEvent.click(screen.getByText(/main/i));
    fireEvent.click(screen.getByText(/New Branch/i));
    const input = screen.getByPlaceholderText("Branch name");
    fireEvent.change(input, { target: { value: "v2" } });
    fireEvent.click(screen.getByText("✓"));

    const branches = useProjectStore.getState().project?.branches ?? {};
    expect(Object.keys(branches).length).toBe(2);
    expect(Object.values(branches).some((b) => b.name === "v2")).toBe(true);
  });
});
