import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { PatternEditor } from "../components/PatternEditor/PatternEditor";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function generatedSteps() {
  return {
    kick: Array.from({ length: 16 }, (_, i) => ({
      active: i === 0,
      velocity: i === 0 ? 127 : 0,
    })),
    hihat_c: Array.from({ length: 16 }, (_, i) => ({
      active: i === 2,
      velocity: i === 2 ? 48 : 0,
    })),
  };
}

describe("PatternEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("routes generation briefs to the drum agent and surfaces QA warnings", async () => {
    invokeMock.mockResolvedValueOnce({
      steps: generatedSteps(),
      reasoning: ["Injected ghost hat for movement"],
      qa: {
        pass: false,
        score: 72,
        warnings: ["Needs stronger backbeat"],
      },
    });

    render(<PatternEditor isPlaying={false} currentBeat={0} />);

    fireEvent.change(screen.getByPlaceholderText("Drum brief..."), {
      target: { value: "dark rolling acid drums" },
    });
    fireEvent.click(screen.getByText("Generate"));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("send_agent_request", {
        endpoint: "agents/drums",
        body: expect.objectContaining({
          brief: "dark rolling acid drums",
          step_count: 16,
          style: "four_on_floor",
        }),
      });
    });

    expect(await screen.findByText("QA: 72/100")).toBeInTheDocument();
    expect(screen.getByText("Needs stronger backbeat")).toBeInTheDocument();
    expect(screen.getByText("Injected ghost hat for movement")).toBeInTheDocument();
    expect(screen.getByTitle("Kick step 1 (vel 127)")).toBeInTheDocument();
    expect(screen.getByTitle("HH Closed step 3 (vel 48)")).toBeInTheDocument();
  });

  it("converts the generated pattern into MIDI notes for the timeline", async () => {
    invokeMock.mockResolvedValueOnce({
      steps: generatedSteps(),
      qa: {
        pass: true,
        score: 91,
        warnings: [],
      },
    });
    const onSendToTimeline = vi.fn();

    render(
      <PatternEditor
        isPlaying={false}
        currentBeat={0}
        onSendToTimeline={onSendToTimeline}
      />
    );

    fireEvent.click(screen.getByText("Generate"));
    await screen.findByTitle("Kick step 1 (vel 127)");

    fireEvent.click(screen.getByText(/Timeline/));

    expect(onSendToTimeline).toHaveBeenCalledWith(
      [
        { pitch: 36, velocity: 127, start: 0, duration: 0.2 },
        { pitch: 42, velocity: 48, start: 0.5, duration: 0.2 },
      ],
      "Drum Pattern",
      { pass: true, score: 91, warnings: [] }
    );
  });
});
