import { describe, it, expect } from "vitest";
import { useKeyboardStore } from "../lib/keyboardStore";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("keyboardStore workbench commands", () => {
  it("opens mixer from command palette", () => {
    useKeyboardStore.getState().setPaletteQuery("open mixer");
    const cmd = useKeyboardStore.getState().filteredCommands.find((c) => c.id === "editor.openMixer");
    expect(cmd).toBeDefined();
    cmd!.action();
    expect(useWorkbenchStore.getState().center.activeTab).toBe("mixer");
  });

  it("toggles bottom panel", () => {
    useWorkbenchStore.setState({
      panels: {
        left: { open: true, activeTab: "project" },
        right: { open: true, activeTab: "agents" },
        bottom: { open: true, activeTab: "agent" },
      },
    });
    const cmd = useKeyboardStore.getState().commands.get("panel.toggleBottom");
    expect(cmd).toBeDefined();
    cmd!.action();
    expect(useWorkbenchStore.getState().panels.bottom.open).toBe(false);
  });
});
