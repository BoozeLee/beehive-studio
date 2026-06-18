import { describe, it, expect, beforeEach } from "vitest";
import { usePatternStore } from "../patternStore";

describe("patternStore", () => {
  beforeEach(() => {
    usePatternStore.setState({
      library: [],
      currentPatternId: undefined,
      name: "Test Pattern",
      rows: [
        { id: "kick", label: "Kick", color: "#f00", pitch: 36 },
        { id: "snare", label: "Snare", color: "#ff0", pitch: 38 },
      ],
      steps: {
        kick: Array.from({ length: 8 }, () => ({ active: false, velocity: 0 })),
        snare: Array.from({ length: 8 }, () => ({ active: false, velocity: 0 })),
      },
      stepCount: 8,
      resolution: 0.25,
      swing: 0,
      agentId: undefined,
      qa: undefined,
      reasoning: [],
      isGenerating: false,
      brief: "",
      undoStack: [],
      redoStack: [],
    });
  });

  it("toggles a step on and off", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    expect(usePatternStore.getState().steps.kick[0].active).toBe(true);
    usePatternStore.getState().toggleStep("kick", 0);
    expect(usePatternStore.getState().steps.kick[0].active).toBe(false);
  });

  it("paints multiple steps when dragging", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    usePatternStore.getState().toggleStep("kick", 1, true);
    usePatternStore.getState().toggleStep("kick", 2, true);
    expect(usePatternStore.getState().steps.kick.slice(0, 3).every((s) => s.active)).toBe(true);
  });

  it("cycles velocity for active steps", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    usePatternStore.getState().cycleVelocity("kick", 0);
    let v = usePatternStore.getState().steps.kick[0].velocity;
    expect([100, 70, 50, 30, 127]).toContain(v);
    usePatternStore.getState().cycleVelocity("kick", 0);
    expect(usePatternStore.getState().steps.kick[0].velocity).not.toBe(v);
  });

  it("resizes step count while preserving data", () => {
    usePatternStore.getState().toggleStep("kick", 2);
    usePatternStore.getState().setStepCount(4);
    expect(usePatternStore.getState().stepCount).toBe(4);
    expect(usePatternStore.getState().steps.kick[2].active).toBe(true);
    usePatternStore.getState().setStepCount(16);
    expect(usePatternStore.getState().steps.kick).toHaveLength(16);
    expect(usePatternStore.getState().steps.kick[2].active).toBe(true);
  });

  it("saves and loads a pattern from the library", () => {
    usePatternStore.getState().toggleStep("snare", 2);
    usePatternStore.getState().saveCurrent();
    const id = usePatternStore.getState().currentPatternId;
    expect(id).toBeTypeOf("string");
    expect(usePatternStore.getState().library).toHaveLength(1);

    usePatternStore.getState().clearPattern();
    expect(usePatternStore.getState().steps.snare[2].active).toBe(false);

    usePatternStore.getState().loadPattern(id!);
    expect(usePatternStore.getState().steps.snare[2].active).toBe(true);
  });

  it("duplicates a pattern", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    usePatternStore.getState().saveCurrent();
    const id = usePatternStore.getState().currentPatternId;
    const newId = usePatternStore.getState().duplicatePattern(id!);
    expect(newId).toBeTypeOf("string");
    expect(usePatternStore.getState().library).toHaveLength(2);
  });

  it("deletes a pattern", () => {
    usePatternStore.getState().saveCurrent();
    const id = usePatternStore.getState().currentPatternId;
    usePatternStore.getState().deletePattern(id!);
    expect(usePatternStore.getState().library).toHaveLength(0);
  });

  it("supports undo and redo", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    expect(usePatternStore.getState().steps.kick[0].active).toBe(true);
    usePatternStore.getState().undo();
    expect(usePatternStore.getState().steps.kick[0].active).toBe(false);
    usePatternStore.getState().redo();
    expect(usePatternStore.getState().steps.kick[0].active).toBe(true);
  });

  it("exposes the current state for external callbacks", () => {
    usePatternStore.getState().toggleStep("kick", 0);
    const current = usePatternStore.getState().getCurrentState();
    expect(current.stepCount).toBe(8);
    expect(current.steps.kick[0].active).toBe(true);
    expect(current.rows).toEqual(["kick", "snare"]);
    expect(current.swing).toBe(0);
  });
});
