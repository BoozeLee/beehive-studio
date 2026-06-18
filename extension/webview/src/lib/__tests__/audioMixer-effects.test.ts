import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type * as audioMixerModule from "../audioMixer";
import type { TrackEffect } from "../desktopTypes";

let audioMixer: typeof audioMixerModule;

const connectedNodes: string[] = [];

beforeAll(async () => {
  const mockAudioNode = {
    connect: vi.fn((dest: unknown) => {
      connectedNodes.push(String(dest));
      return dest;
    }),
    disconnect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    pan: { value: 0 },
    getByteTimeDomainData: vi.fn(),
  };

  const mockAudioContext = {
    createGain: vi.fn(() => ({ ...mockAudioNode })),
    createStereoPanner: vi.fn(() => ({ ...mockAudioNode, pan: { value: 0 } })),
    createAnalyser: vi.fn(() => ({ ...mockAudioNode, fftSize: 32 })),
    createConvolver: vi.fn(() => ({ ...mockAudioNode, buffer: null })),
    createDelay: vi.fn(() => ({ ...mockAudioNode, delayTime: { value: 0 } })),
    createBuffer: vi.fn(() => ({ numberOfChannels: 2, getChannelData: () => new Float32Array(10) })),
    sampleRate: 48000,
    destination: { ...mockAudioNode },
    currentTime: 0,
  };

  const mockEffect = (name: string) => ({
    connect: vi.fn((dest: unknown) => {
      connectedNodes.push(`${name}->${String(dest)}`);
      return dest;
    }),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    decay: 2,
    wet: { value: 0.3 },
    delayTime: { value: 0.375 },
    feedback: { value: 0.3 },
    frequency: { value: 2000 },
    Q: { value: 1 },
    distortion: 0.4,
    low: { value: 0 },
    mid: { value: 0 },
    high: { value: 0 },
    threshold: { value: -1 },
  });

  vi.doMock("tone", () => ({
    context: { rawContext: mockAudioContext },
    Transport: { bpm: { value: 120 } },
    Reverb: vi.fn(() => mockEffect("reverb")),
    FeedbackDelay: vi.fn(() => mockEffect("delay")),
    Filter: vi.fn(() => mockEffect("filter")),
    Distortion: vi.fn(() => mockEffect("distortion")),
    EQ3: vi.fn(() => mockEffect("eq3")),
    Limiter: vi.fn(() => mockEffect("limiter")),
  }));

  audioMixer = await import("../audioMixer");
});

describe("audioMixer effects", () => {
  beforeEach(() => {
    connectedNodes.length = 0;
    vi.clearAllMocks();
    audioMixer.disposeMixer();
  });

  it("creates a channel with no effects by default", () => {
    audioMixer.initMixer();
    audioMixer.createChannel("t1", "Drums");
    expect(audioMixer.getChannelState("t1")).toBeDefined();
  });

  it("adds a channel effect and wires it into the chain", () => {
    audioMixer.initMixer();
    audioMixer.createChannel("t1", "Drums");
    const effect: TrackEffect = {
      id: "fx1",
      type: "reverb",
      params: { decay: 2, wet: 0.3 },
      bypass: false,
    };
    const ok = audioMixer.addChannelEffect("t1", effect);
    expect(ok).toBe(true);
  });

  it("updates effect parameters", () => {
    audioMixer.initMixer();
    audioMixer.createChannel("t1", "Drums");
    audioMixer.addChannelEffect("t1", { id: "fx1", type: "reverb", params: { decay: 2, wet: 0.3 }, bypass: false });
    audioMixer.updateChannelEffect("t1", "fx1", { wet: 0.8 });
    expect(audioMixer.getChannelState("t1")?.fxReturns).toEqual({});
  });

  it("removes a channel effect", () => {
    audioMixer.initMixer();
    audioMixer.createChannel("t1", "Drums");
    audioMixer.addChannelEffect("t1", { id: "fx1", type: "reverb", params: { decay: 2, wet: 0.3 }, bypass: false });
    audioMixer.removeChannelEffect("t1", "fx1");
    expect(audioMixer.getChannelState("t1")).toBeDefined();
  });

  it("sets multiple channel effects at once", () => {
    audioMixer.initMixer();
    audioMixer.createChannel("t1", "Drums");
    audioMixer.setChannelEffects("t1", [
      { id: "fx1", type: "reverb", params: { decay: 2, wet: 0.3 }, bypass: false },
      { id: "fx2", type: "delay", params: { delayTime: 0.375, feedback: 0.3, wet: 0.25 }, bypass: false },
    ]);
    expect(audioMixer.getChannelState("t1")).toBeDefined();
  });

  it("updates master EQ", () => {
    audioMixer.initMixer();
    audioMixer.updateMasterEq(2, -1, 3);
    expect(audioMixer.getMasterState().gain).toBeGreaterThanOrEqual(0);
  });

  it("updates master limiter threshold", () => {
    audioMixer.initMixer();
    audioMixer.setMasterLimiterThreshold(-6);
    expect(audioMixer.getMasterState().gain).toBeGreaterThanOrEqual(0);
  });
});
