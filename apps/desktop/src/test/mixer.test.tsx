import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../../../../packages/core-models/index";
import { Mixer } from "../components/Mixer/Mixer";
import { useTimelineStore } from "../lib/timelineStore";

vi.mock("../lib/audioMixer", async () => {
  const actual = await vi.importActual<typeof import("../lib/audioMixer")>("../lib/audioMixer");
  return {
    ...actual,
    getAllChannelStates: vi.fn(() => [
      { id: "track-1", level: 0.25, peak: 0.5 },
      { id: "track-2", level: 0.1, peak: 0.2 },
    ]),
    getMasterState: vi.fn(() => ({ gain: 0.9, level: 0.33, peak: 0.66 })),
    getSendBuses: vi.fn(() => [
      { id: "reverb", name: "Reverb", level: 0.4 },
      { id: "delay", name: "Delay", level: 0.2 },
    ]),
    setMasterGain: vi.fn(),
    setSendBusLevel: vi.fn(),
    resetPeaks: vi.fn(),
  };
});

function track(id: string, name: string): Track {
  return {
    id,
    name,
    type: "midi",
    color: "#ff8c42",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips: [],
    automationLanes: [],
  };
}

describe("Mixer", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("track-1", "Kick"), track("track-2", "Bass")],
      clips: {},
      selectedTrackId: null,
      selectedClipId: null,
      cursorPosition: 0,
      zoom: 16,
      scrollOffset: { x: 0, y: 0 },
      snapToGrid: true,
      gridDivision: 1,
    });
  });

  it("renders timeline tracks and the master strip", () => {
    render(<Mixer />);

    expect(screen.getByTestId("channel-strip-track-1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-strip-track-2")).toBeInTheDocument();
    expect(screen.getByTestId("master-strip")).toBeInTheDocument();
  });

  it("updates timeline track volume and pan", () => {
    render(<Mixer />);

    fireEvent.change(screen.getByLabelText("Kick volume"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Kick pan"), { target: { value: "-0.25" } });

    const kick = useTimelineStore.getState().tracks[0];
    expect(kick.volume).toBe(0.5);
    expect(kick.pan).toBe(-0.25);
  });

  it("updates timeline track mute, solo, and arm state", () => {
    render(<Mixer />);

    fireEvent.click(screen.getByLabelText("Kick mute"));
    fireEvent.click(screen.getByLabelText("Kick solo"));
    fireEvent.click(screen.getByLabelText("Kick arm"));

    expect(useTimelineStore.getState().tracks[0]).toMatchObject({
      muted: true,
      solo: true,
      arm: true,
    });
  });

  it("shows empty track guidance and master strip when no tracks exist", () => {
    useTimelineStore.setState({ tracks: [] });

    render(<Mixer />);

    expect(screen.getByText("Add tracks in the Timeline to see them here")).toBeInTheDocument();
    expect(screen.getByTestId("master-strip")).toBeInTheDocument();
  });
});
