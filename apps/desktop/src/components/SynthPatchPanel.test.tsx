import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SynthPatchPanel } from "./SynthPatchPanel";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

const mockAgentResult = vi.hoisted(() => ({
  id: "test-id",
  status: "completed",
  reasoning: ["Detected category: bass", "Generated 1 oscillator(s)", "Patch name: Dark Sub Bass"],
  patch: {
    name: "Dark Sub Bass",
    category: "bass",
    synth_type: "MonoSynth",
    oscillators: [{ type: "sawtooth", detune: 5, gain: 0.8 }],
    filter: { type: "lowpass", frequency: 400, Q: 2, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3, amount: 1000 } },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 },
    lfos: [{ type: "sine", frequency: 4, depth: 0.3, target: "filter" }],
    effects: [{ type: "reverb" }, { type: "distortion" }],
  },
  web_audio_config: { synthType: "MonoSynth" },
  _synth_type: "MonoSynth",
  _category: "bass",
}));

describe("SynthPatchPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockResolvedValue(mockAgentResult);
  });

  it("renders the panel with title", () => {
    render(<SynthPatchPanel />);
    expect(screen.getByText(/Synth Patch Designer/)).toBeTruthy();
  });

  it("has an input field for sound description", () => {
    render(<SynthPatchPanel />);
    const input = screen.getByPlaceholderText(/describe a sound/i);
    expect(input).toBeTruthy();
  });

  it("has a generate button", () => {
    render(<SynthPatchPanel />);
    expect(screen.getByText("Generate")).toBeTruthy();
  });

  it("generate button is disabled with empty input", () => {
    render(<SynthPatchPanel />);
    const button = screen.getByText("Generate") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("generate button enables with input", () => {
    render(<SynthPatchPanel />);
    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark bass" } });
    const button = screen.getByText("Generate") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("calls invoke on generate", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "warm pad" } });

    const button = screen.getByText("Generate");
    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("run_sound_design_agent", expect.any(Object));
    });
  });

  it("displays patch name after generation", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("Dark Sub Bass")).toBeTruthy();
    });
  });

  it("displays category badge", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("bass")).toBeTruthy();
    });
  });

  it("displays synth type", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("MonoSynth")).toBeTruthy();
    });
  });

  it("shows oscillator info", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText(/sawtooth/)).toBeTruthy();
    });
  });

  it("shows filter info", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText(/lowpass.*400Hz/i)).toBeTruthy();
    });
  });

  it("shows ADSR envelope values", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("0.01")).toBeTruthy(); // attack
      expect(screen.getByText("0.70")).toBeTruthy(); // sustain
    });
  });

  it("shows LFO info when present", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText(/sine.*filter/i)).toBeTruthy();
    });
  });

  it("shows effects list when present", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("reverb")).toBeTruthy();
      expect(screen.getByText("distortion")).toBeTruthy();
    });
  });

  it("has a preview note slider", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      const slider = document.querySelector('input[type="range"]');
      expect(slider).toBeTruthy();
    });
  });

  it("has a Play button after patch generated", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText("Play")).toBeTruthy();
    });
  });

  it("has a save button after patch generated", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      const saveBtn = screen.getByTitle("Save patch to presets");
      expect(saveBtn).toBeTruthy();
    });
  });

  it("shows reasoning trace after generation", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText(/Generating synth patch/i)).toBeTruthy();
    });
  });

  it("shows presets toggle", () => {
    render(<SynthPatchPanel />);
    expect(screen.getByText(/Presets/)).toBeTruthy();
  });

  it("shows empty state for no saved patches", () => {
    render(<SynthPatchPanel />);
    fireEvent.click(screen.getByText(/Presets/));
    expect(screen.getByText(/No saved patches/)).toBeTruthy();
  });

  it("saves and loads patches via localStorage", async () => {
    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getAllByText("Dark Sub Bass").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTitle("Save patch to presets"));

    // Open presets panel
    fireEvent.click(screen.getByText(/Presets/));

    // "Dark Sub Bass" should now appear twice: in patch display and in saved list
    expect(screen.getAllByText("Dark Sub Bass").length).toBeGreaterThanOrEqual(2);
  });

  it("displays error reasoning on failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Backend offline"));

    render(<SynthPatchPanel />);

    const input = screen.getByPlaceholderText(/describe a sound/i);
    fireEvent.change(input, { target: { value: "dark sub bass" } });
    fireEvent.click(screen.getByText("Generate"));

    await vi.waitFor(() => {
      expect(screen.getByText(/Failed:.*Backend offline/i)).toBeTruthy();
    });
  });
});
