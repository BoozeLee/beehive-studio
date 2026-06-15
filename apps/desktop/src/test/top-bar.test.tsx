import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "../components/Layout/TopBar";

describe("TopBar", () => {
  it("calls onPlayPause when play is clicked", () => {
    const onPlayPause = vi.fn();
    render(
      <TopBar
        projectName="Test"
        bpm={128}
        isPlaying={false}
        onPlayPause={onPlayPause}
        onStop={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("▶ Play"));
    expect(onPlayPause).toHaveBeenCalled();
  });

  it("shows pause label when playing", () => {
    render(
      <TopBar
        projectName="Test"
        bpm={128}
        isPlaying={true}
        onPlayPause={vi.fn()}
        onStop={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );
    expect(screen.getByText("⏸ Pause")).toBeInTheDocument();
  });
});
