import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadWorkbenchState, saveWorkbenchState } from "../lib/panelPersistence";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockRejectedValue(new Error("no Tauri in test")),
  },
}));

describe("panel persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default workbench state on DB failure", async () => {
    const state = await loadWorkbenchState();
    expect(state.panels.left.activeTab).toBe("project");
    expect(state.center.tabs).toContain("arrangement");
  });

  it("swallows save errors without throwing", async () => {
    await expect(saveWorkbenchState({
      panels: {
        left: { open: true, activeTab: "project" },
        right: { open: true, activeTab: "agents" },
        bottom: { open: true, activeTab: "agent" },
      },
      center: { tabs: ["arrangement"], activeTab: "arrangement" },
    })).resolves.toBeUndefined();
  });
});
