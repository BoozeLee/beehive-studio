import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeftRail } from "../components/Layout/LeftRail";
import { RightRail } from "../components/Layout/RightRail";
import { BottomPanel } from "../components/Layout/BottomPanel";
import { EditorWorkbench } from "../components/Layout/EditorWorkbench";
import { useWorkbenchStore } from "../lib/workbenchStore";

// Proves the 8 tool windows re-homed during M1 are reachable in the dock:
// Plugins (left), Proposal + Taste (right), Build Plan (bottom),
// Prompt + Lua + Waveform (center editor tabs).

describe("M1 dock re-homing — all panels reachable", () => {
  it("LeftRail surfaces the Plugins tab", () => {
    render(
      <LeftRail
        projectPanel={<div>Project</div>}
        patternPanel={<div>Patterns</div>}
        samplePanel={<div>Samples</div>}
        gitPanel={<div>Git</div>}
        pluginsPanel={<div>PluginMarketplaceContent</div>}
      />
    );
    fireEvent.click(screen.getByText("🔌 Plugins"));
    expect(useWorkbenchStore.getState().panels.left.activeTab).toBe("plugins");
    expect(screen.getByText("PluginMarketplaceContent")).toBeInTheDocument();
  });

  it("RightRail surfaces the Proposal and Taste tabs", () => {
    render(
      <RightRail
        inspectorPanel={<div>Inspector</div>}
        agentsPanel={<div>Agents</div>}
        proposalPanel={<div>ProposalContent</div>}
        tastePanel={<div>TasteContent</div>}
      />
    );
    fireEvent.click(screen.getByText("🍯 Proposal"));
    expect(useWorkbenchStore.getState().panels.right.activeTab).toBe("proposal");
    expect(screen.getByText("ProposalContent")).toBeInTheDocument();
    fireEvent.click(screen.getByText("🕸️ Taste"));
    expect(useWorkbenchStore.getState().panels.right.activeTab).toBe("taste");
    expect(screen.getByText("TasteContent")).toBeInTheDocument();
  });

  it("BottomPanel surfaces the Build Plan tab", () => {
    render(
      <BottomPanel
        agentPanel={<div>Agent</div>}
        consolePanel={<div>Console</div>}
        problemsPanel={<div>Problems</div>}
        buildPanel={<div>BuildPlanContent</div>}
      />
    );
    fireEvent.click(screen.getByText("▶️ Build Plan"));
    expect(useWorkbenchStore.getState().panels.bottom.activeTab).toBe("build");
    expect(screen.getByText("BuildPlanContent")).toBeInTheDocument();
  });

  it("EditorWorkbench exposes Prompt, Lua, and Waveform center tabs", () => {
    render(
      <EditorWorkbench
        arrangement={<div>Arrangement</div>}
        patternEditor={<div>Pattern</div>}
        pianoRoll={<div>Piano</div>}
        mixer={<div>Mixer</div>}
        effects={<div>Effects</div>}
        prompt={<div>PromptContent</div>}
        lua={<div>LuaContent</div>}
        waveform={<div>WaveformContent</div>}
      />
    );
    // center.tabs default now includes prompt/lua/waveform, so their tabs render
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Lua")).toBeInTheDocument();
    expect(screen.getByText("Waveform")).toBeInTheDocument();
  });
});
