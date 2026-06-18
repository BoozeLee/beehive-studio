import { describe, it, expect, beforeEach } from "vitest";
import { useTimelineStore } from "../timelineStore";

describe("timelineStore", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      cursorPosition: 0,
      zoom: 16,
      scrollOffset: { x: 0, y: 0 },
      snapToGrid: true,
      gridDivision: 1,
    });
  });

  it("moves the cursor", () => {
    useTimelineStore.getState().setCursorPosition(16);
    expect(useTimelineStore.getState().cursorPosition).toBe(16);
  });

  it("zooms with clamping", () => {
    useTimelineStore.getState().setZoom(32);
    expect(useTimelineStore.getState().zoom).toBe(32);
    useTimelineStore.getState().setZoom(1000);
    expect(useTimelineStore.getState().zoom).toBe(128);
    useTimelineStore.getState().setZoom(1);
    expect(useTimelineStore.getState().zoom).toBe(4);
  });

  it("updates scroll offset", () => {
    useTimelineStore.getState().setScrollOffset({ x: 120, y: 40 });
    expect(useTimelineStore.getState().scrollOffset).toEqual({ x: 120, y: 40 });
  });

  it("toggles snap and changes grid division", () => {
    useTimelineStore.getState().setSnapToGrid(false);
    expect(useTimelineStore.getState().snapToGrid).toBe(false);
    useTimelineStore.getState().setGridDivision(0.5);
    expect(useTimelineStore.getState().gridDivision).toBe(0.5);
  });
});
