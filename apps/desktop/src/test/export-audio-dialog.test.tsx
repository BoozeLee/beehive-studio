import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportAudioDialog } from "../components/ExportAudioDialog";

const summary = {
  clipCount: 2,
  trackCount: 2,
  noteCount: 12,
  totalBeats: 16,
  durationSeconds: 9,
};

describe("ExportAudioDialog", () => {
  it("selects a preset and requests export with reveal", () => {
    const onPresetChange = vi.fn();
    const onExport = vi.fn();
    render(
      <ExportAudioDialog
        isOpen
        isExporting={false}
        preset="festival"
        progress={0}
        progressLabel="Preparing"
        summary={summary}
        onPresetChange={onPresetChange}
        onClose={vi.fn()}
        onExport={onExport}
      />
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Club/i }));
    fireEvent.click(screen.getByRole("button", { name: "Export and Reveal" }));

    expect(onPresetChange).toHaveBeenCalledWith("club");
    expect(onExport).toHaveBeenCalledWith(true);
  });

  it("shows render progress and locks commands while exporting", () => {
    render(
      <ExportAudioDialog
        isOpen
        isExporting
        preset="draft"
        progress={0.75}
        progressLabel="Applying master preset"
        summary={summary}
        onPresetChange={vi.fn()}
        onClose={vi.fn()}
        onExport={vi.fn()}
      />
    );

    expect(screen.getByText("Applying master preset")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
