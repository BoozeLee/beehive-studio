import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomPanel } from "../components/Layout/BottomPanel";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("BottomPanel", () => {
  it("switches tabs", () => {
    render(
      <BottomPanel
        agentPanel={<div>Chat</div>}
        consolePanel={<div>Console</div>}
        problemsPanel={<div>Problems</div>}
      />
    );
    fireEvent.click(screen.getByText("🛠️ Build Console"));
    expect(useWorkbenchStore.getState().panels.bottom.activeTab).toBe("console");
    expect(screen.getByText("Console")).toBeInTheDocument();
  });
});
