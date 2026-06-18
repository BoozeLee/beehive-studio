import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudioGraph } from "../Mixer/AudioGraph";
import { useProjectStore } from "../../../stores/projectStore";

describe("AudioGraph", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: null,
      tracks: [
        {
          id: "t1",
          name: "Drums",
          type: "drum",
          color: "#ef4444",
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          arm: false,
          clips: [],
          automationLanes: [],
          effects: [{ id: "fx1", type: "reverb", params: { decay: 2, wet: 0.3 }, bypass: false }],
        },
        {
          id: "t2",
          name: "Bass",
          type: "bass",
          color: "#3b82f6",
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          arm: false,
          clips: [],
          automationLanes: [],
          effects: [],
        },
      ],
      clips: [],
      selectedTrackId: undefined,
      selectedClipId: undefined,
      buildJobs: [],
      tasteNodes: [],
      tasteEdges: [],
      patterns: [],
    });
  });

  it("renders track, effect, send, master, and output nodes", () => {
    render(<AudioGraph />);
    expect(screen.getByTestId("audio-graph")).toBeInTheDocument();
    expect(screen.getByTestId("audio-graph-node-t1")).toBeInTheDocument();
    expect(screen.getByTestId("audio-graph-node-t2")).toBeInTheDocument();
    expect(screen.getByTestId("audio-graph-node-master")).toBeInTheDocument();
    expect(screen.getByTestId("audio-graph-node-output")).toBeInTheDocument();
    expect(screen.getByTestId("audio-graph-node-t1-fx-fx1")).toBeInTheDocument();
  });
});
