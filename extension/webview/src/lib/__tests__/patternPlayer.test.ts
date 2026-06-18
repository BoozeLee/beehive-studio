import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type * as patternPlayerModule from "../patternPlayer";
import { DRUM_ROWS, createEmptySteps } from "../patternTypes";

let patternPlayer: typeof patternPlayerModule;

const mockTriggers: Array<{ pitch: number; velocity: number }> = [];
const scheduledCallbacks: Array<(time: number) => void> = [];

beforeAll(async () => {
  const mockSynth = {
    triggerAttackRelease: vi.fn((pitch: number, _duration: string, _time: number, velocity: number) => {
      mockTriggers.push({ pitch, velocity });
    }),
    dispose: vi.fn(),
    volume: { value: 0 },
    toDestination: vi.fn().mockReturnThis(),
  };

  const mockTransport = {
    scheduleRepeat: vi.fn((cb: (time: number) => void) => {
      scheduledCallbacks.push(cb);
      return scheduledCallbacks.length;
    }),
    clear: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    get seconds() {
      return 0;
    },
    bpm: { value: 120 } as any,
  };

  vi.doMock("tone", () => ({
    Transport: mockTransport,
    MembraneSynth: vi.fn(() => ({ ...mockSynth })),
    PolySynth: vi.fn(() => ({ ...mockSynth })),
    Synth: vi.fn(),
  }));

  patternPlayer = await import("../patternPlayer");
});

describe("patternPlayer", () => {
  beforeEach(() => {
    mockTriggers.length = 0;
    scheduledCallbacks.length = 0;
    vi.clearAllMocks();
    patternPlayer.stopPatternPreview();
  });

  it("starts and stops preview", () => {
    const steps = createEmptySteps(DRUM_ROWS, 16);
    steps.kick[0] = { active: true, velocity: 100 };
    patternPlayer.previewPattern(DRUM_ROWS, steps, 120, 0.25, 0);
    expect(patternPlayer.isPatternPreviewPlaying()).toBe(true);
    patternPlayer.stopPatternPreview();
    expect(patternPlayer.isPatternPreviewPlaying()).toBe(false);
  });

  it("triggers active steps only", () => {
    const steps = createEmptySteps(DRUM_ROWS, 16);
    steps.kick[0] = { active: true, velocity: 127 };
    patternPlayer.previewPattern(DRUM_ROWS, steps, 120, 0.25, 0);
    expect(scheduledCallbacks).toHaveLength(1);
    scheduledCallbacks[0](0);
    expect(mockTriggers).toHaveLength(1);
    expect(mockTriggers[0].pitch).toBe(36);
    expect(mockTriggers[0].velocity).toBeCloseTo(1);
  });
});
