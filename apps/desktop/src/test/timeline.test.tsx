import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { Timeline } from "../components/Timeline/Timeline";
import { useTimelineStore } from "../lib/timelineStore";

function track(id: string, clips: string[] = []): Track {
  return {
    id,
    name: id,
    type: "midi",
    color: "#ff8c42",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips,
    automationLanes: [],
  };
}

function clip(id: string, trackId = "track-1"): Clip {
  return {
    id,
    name: "Drum Clip",
    type: "midi",
    trackId,
    start: 0,
    duration: 4,
    loop: false,
    color: "#ef4444",
    midiData: { notes: [{ pitch: 36, velocity: 127, start: 0, duration: 1 }] },
    playback: { instrument: "drum" },
    metadata: { generative: true },
    createdAt: 1,
    updatedAt: 1,
  };
}

function seedTimeline() {
  useTimelineStore.setState({
    tracks: [track("track-1", ["clip-1"]), track("track-2")],
    clips: { "clip-1": clip("clip-1") },
    selectedTrackId: null,
    selectedClipId: null,
    cursorPosition: 0,
    zoom: 16,
    scrollOffset: { x: 0, y: 0 },
    snapToGrid: true,
    gridDivision: 1,
  });
}

function mockLanesRect() {
  const lanes = screen.getByTestId("timeline-lanes");
  lanes.getBoundingClientRect = () =>
    ({
      left: 180,
      top: 100,
      right: 980,
      bottom: 300,
      width: 800,
      height: 200,
      x: 180,
      y: 100,
      toJSON: () => {},
    }) as DOMRect;
}

describe("Timeline", () => {
  beforeEach(seedTimeline);

  it("seeks to the snapped beat when the ruler is clicked", () => {
    const seekCalls: number[] = [];
    render(<Timeline isPlaying={false} currentBeat={0} onSeek={(beat) => seekCalls.push(beat)} />);
    mockLanesRect();

    fireEvent.click(screen.getByTestId("timeline-ruler"), { clientX: 221 });

    expect(seekCalls).toEqual([3]);
    expect(useTimelineStore.getState().cursorPosition).toBe(3);
  });

  it("drags a clip horizontally to update its start beat", () => {
    render(<Timeline isPlaying={false} currentBeat={0} />);
    mockLanesRect();

    fireEvent.mouseDown(screen.getByTestId("timeline-clip-clip-1"), {
      button: 0,
      clientX: 190,
      clientY: 134,
    });
    fireEvent.mouseMove(window, { clientX: 222, clientY: 134 });
    fireEvent.mouseUp(window);

    expect(useTimelineStore.getState().clips["clip-1"].start).toBe(2);
  });

  it("drags a clip vertically onto another track", () => {
    render(<Timeline isPlaying={false} currentBeat={0} />);
    mockLanesRect();

    fireEvent.mouseDown(screen.getByTestId("timeline-clip-clip-1"), {
      button: 0,
      clientX: 190,
      clientY: 134,
    });
    fireEvent.mouseMove(window, { clientX: 190, clientY: 174 });
    fireEvent.mouseUp(window);

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"].trackId).toBe("track-2");
    expect(state.tracks[0].clips).toEqual([]);
    expect(state.tracks[1].clips).toEqual(["clip-1"]);
  });

  it("resizes a clip from its right handle", () => {
    render(<Timeline isPlaying={false} currentBeat={0} />);
    mockLanesRect();

    fireEvent.mouseDown(screen.getByTestId("timeline-clip-clip-1-resize"), {
      button: 0,
      clientX: 244,
      clientY: 134,
    });
    fireEvent.mouseMove(window, { clientX: 276, clientY: 134 });
    fireEvent.mouseUp(window);

    expect(useTimelineStore.getState().clips["clip-1"].duration).toBe(6);
  });

  it("deletes a clip from the context menu", () => {
    render(<Timeline isPlaying={false} currentBeat={0} />);

    fireEvent.contextMenu(screen.getByTestId("timeline-clip-clip-1"), {
      clientX: 260,
      clientY: 140,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(useTimelineStore.getState().clips["clip-1"]).toBeUndefined();
  });

  it("duplicates a clip from the context menu", () => {
    render(<Timeline isPlaying={false} currentBeat={0} />);

    fireEvent.contextMenu(screen.getByTestId("timeline-clip-clip-1"), {
      clientX: 260,
      clientY: 140,
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    const state = useTimelineStore.getState();
    const duplicates = Object.values(state.clips).filter((c) => c.name === "Drum Clip Copy");
    expect(duplicates).toHaveLength(1);
    expect(screen.getAllByText(/Drum Clip/)).toHaveLength(2);
  });
});
