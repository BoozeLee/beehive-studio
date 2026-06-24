import { describe, it, expect } from "vitest";
import { useWorkbenchStore } from "../lib/workbenchStore";

describe("workbench store", () => {
  it("opens a new center tab and activates it", () => {
    useWorkbenchStore.setState({ center: { tabs: ["arrangement"], activeTab: "arrangement" } });
    useWorkbenchStore.getState().openCenterTab("mixer");
    const state = useWorkbenchStore.getState();
    expect(state.center.tabs).toEqual(["arrangement", "mixer"]);
    expect(state.center.activeTab).toBe("mixer");
  });

  it("toggles panel visibility", () => {
    useWorkbenchStore.setState({
      panels: {
        left: { open: true, activeTab: "project" },
        right: { open: true, activeTab: "agents" },
        bottom: { open: true, activeTab: "agent" },
      },
    });
    useWorkbenchStore.getState().togglePanel("bottom");
    expect(useWorkbenchStore.getState().panels.bottom.open).toBe(false);
  });

  it("creates a new chat session and activates it", () => {
    const id = useWorkbenchStore.getState().createSession("melody", "Melody");
    expect(useWorkbenchStore.getState().chat.activeSessionId).toBe(id);
    const session = useWorkbenchStore.getState().chat.sessions.find((s) => s.id === id);
    expect(session?.agentId).toBe("melody");
  });
});
