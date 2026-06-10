import { describe, it, expect, vi } from "vitest";
import {
  createEffect,
  updateEffectParam,
  EFFECT_LABELS,
  EFFECT_PARAM_RANGE,
  createWebAudioEffect,
  disposeEffectChain,
  buildEffectChain,
} from "./effectEngine";

describe("createEffect", () => {
  it("creates a reverb effect with default params", () => {
    const fx = createEffect("reverb");
    expect(fx.type).toBe("reverb");
    expect(fx.bypass).toBe(false);
    expect(fx.params.decay).toBe(2);
    expect(fx.params.wet).toBe(0.5);
    expect(fx.params.preDelay).toBe(0.01);
  });

  it("creates a delay effect with default params", () => {
    const fx = createEffect("delay");
    expect(fx.type).toBe("delay");
    expect(fx.params.delayTime).toBe(0.25);
    expect(fx.params.feedback).toBe(0.3);
    expect(fx.params.wet).toBe(0.5);
  });

  it("creates a filter effect with default params", () => {
    const fx = createEffect("filter");
    expect(fx.type).toBe("filter");
    expect(fx.params.frequency).toBe(1000);
    expect(fx.params.Q).toBe(1);
  });

  it("creates a distortion effect with default params", () => {
    const fx = createEffect("distortion");
    expect(fx.type).toBe("distortion");
    expect(fx.params.distortion).toBe(0.4);
    expect(fx.params.wet).toBe(0.5);
  });

  it("generates a unique ID for each effect", () => {
    const fx1 = createEffect("reverb");
    const fx2 = createEffect("reverb");
    expect(fx1.id).not.toBe(fx2.id);
  });
});

describe("updateEffectParam", () => {
  it("updates a parameter value", () => {
    const fx = createEffect("reverb");
    updateEffectParam(fx, "decay", 4.0);
    expect(fx.params.decay).toBe(4.0);
  });
});

describe("createWebAudioEffect", () => {
  it("creates a filter node", () => {
    const ctx = { createBiquadFilter: () => new MockBiquadFilter(), sampleRate: 44100 } as unknown as AudioContext;
    const fx = createEffect("filter");
    const node = createWebAudioEffect(ctx, fx);
    expect(node).toBeDefined();
  });

  it("creates a delay node", () => {
    const ctx = {
      createDelay: () => ({ delayTime: { value: 0 }, connect: vi.fn().mockReturnThis() }),
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn().mockReturnThis() }),
    } as unknown as AudioContext;
    const fx = createEffect("delay");
    const node = createWebAudioEffect(ctx, fx);
    expect(node).toBeDefined();
  });

  it("creates a distortion node", () => {
    const ctx = {
      createWaveShaper: () => ({ curve: null, connect: vi.fn() }),
    } as unknown as AudioContext;
    const fx = createEffect("distortion");
    const node = createWebAudioEffect(ctx, fx);
    expect(node).toBeDefined();
  });
});

describe("disposeEffectChain", () => {
  it("disconnects all nodes without error", () => {
    const nodes = [
      { disconnect: vi.fn() },
      { disconnect: vi.fn() },
    ] as unknown as AudioNode[];
    disposeEffectChain(nodes);
    expect(nodes[0].disconnect).toHaveBeenCalled();
    expect(nodes[1].disconnect).toHaveBeenCalled();
  });

  it("handles empty node list", () => {
    expect(() => disposeEffectChain([])).not.toThrow();
  });
});

describe("EFFECT_LABELS", () => {
  it("has labels for all effect types", () => {
    expect(EFFECT_LABELS.reverb).toBe("Reverb");
    expect(EFFECT_LABELS.delay).toBe("Delay");
    expect(EFFECT_LABELS.filter).toBe("Filter");
    expect(EFFECT_LABELS.distortion).toBe("Distortion");
  });
});

describe("EFFECT_PARAM_RANGE", () => {
  it("has range definitions for all effects", () => {
    expect(EFFECT_PARAM_RANGE.reverb.decay.min).toBe(0.1);
    expect(EFFECT_PARAM_RANGE.reverb.decay.max).toBe(10);
    expect(EFFECT_PARAM_RANGE.delay.feedback.min).toBe(0);
    expect(EFFECT_PARAM_RANGE.delay.feedback.max).toBe(0.9);
    expect(EFFECT_PARAM_RANGE.filter.frequency.min).toBe(20);
    expect(EFFECT_PARAM_RANGE.distortion.distortion.step).toBe(0.01);
  });

  it("buildEffectChain creates passthrough for empty effects", () => {
    const ctx = {
      createGain: () => ({
        gain: { value: 0 },
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      }),
    } as unknown as AudioContext;
    const result = buildEffectChain(ctx, []);
    expect(result.input).toBeDefined();
    expect(result.output).toBeDefined();
    expect(result.nodes).toHaveLength(1);
  });

  it("buildEffectChain handles all-bypassed effects", () => {
    const ctx = {
      createGain: () => ({
        gain: { value: 0 },
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
      }),
    } as unknown as AudioContext;
    const fx = createEffect("reverb");
    fx.bypass = true;
    const result = buildEffectChain(ctx, [fx]);
    expect(result.nodes).toHaveLength(1); // passthrough only
  });

  it("param ranges have correct defaults matching createEffect", () => {
    const fx = createEffect("reverb");
    for (const [param, range] of Object.entries(EFFECT_PARAM_RANGE.reverb)) {
      expect(fx.params[param]).toBeGreaterThanOrEqual(range.min);
      expect(fx.params[param]).toBeLessThanOrEqual(range.max);
    }
  });
});

class MockBiquadFilter {
  type: BiquadFilterType = "lowpass";
  frequency = { value: 1000 };
  Q = { value: 1 };
  connect = vi.fn().mockReturnThis();
}
