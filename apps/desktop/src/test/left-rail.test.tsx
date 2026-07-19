import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeftRail } from "../components/Layout/LeftRail";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("LeftRail", () => {
  it("switches tabs", () => {
    render(
      <LeftRail
        projectPanel={<div>Project</div>}
        patternPanel={<div>Patterns</div>}
        samplePanel={<div>Samples</div>}
        gitPanel={<div>Git</div>}
        pluginsPanel={<div>Plugins</div>}
      />
    );
    fireEvent.click(screen.getByTitle("Patterns"));
    expect(useWorkbenchStore.getState().panels.left.activeTab).toBe("patterns");
    expect(screen.getByText("Patterns")).toBeInTheDocument();
  });
});
