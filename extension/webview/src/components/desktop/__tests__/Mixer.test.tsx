import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Mixer } from "../Mixer/Mixer";
import { useProjectStore } from "../../../stores/projectStore";

describe("Mixer", () => {
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
          effects: [],
          sends: {},
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

  it("renders channel strips and master", () => {
    render(<Mixer />);
    expect(screen.getByTestId("channel-strip-t1")).toBeInTheDocument();
    expect(screen.getByTestId("master-strip")).toBeInTheDocument();
  });

  it("toggles mute via the M button", () => {
    render(<Mixer />);
    const muteBtn = screen.getByRole("button", { name: /mute/i });
    fireEvent.click(muteBtn);
    expect(useProjectStore.getState().tracks[0].muted).toBe(true);
  });

  it("adds a reverb effect from the FX dropdown", () => {
    render(<Mixer />);
    const fxToggle = screen.getByText(/FX/i);
    fireEvent.click(fxToggle);

    const addSelect = screen.getByRole("combobox", { name: "+ Add FX" });
    fireEvent.change(addSelect, { target: { value: "reverb" } });

    const effects = useProjectStore.getState().tracks[0].effects;
    expect(effects).toHaveLength(1);
    expect(effects?.[0].type).toBe("reverb");
  });
});
