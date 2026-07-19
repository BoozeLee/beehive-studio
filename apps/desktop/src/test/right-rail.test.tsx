import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RightRail } from "../components/Layout/RightRail";
import { AgentRoster } from "../components/AgentDirector/AgentRoster";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("RightRail", () => {
  it("switches to the agents tab and renders the roster", () => {
    render(<RightRail inspectorPanel={<div>Inspector</div>} agentsPanel={<AgentRoster />} proposalPanel={<div>Proposal</div>} tastePanel={<div>Taste</div>} />);
    fireEvent.click(screen.getByTitle("Agents"));
    expect(useWorkbenchStore.getState().panels.right.activeTab).toBe("agents");
    expect(screen.getByText("Active Agents")).toBeInTheDocument();
  });
});
