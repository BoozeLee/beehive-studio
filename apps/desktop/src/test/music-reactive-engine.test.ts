import { afterEach, describe, expect, it } from "vitest";
import {
  createReactiveEngine,
  syncEngineToTransport,
  type ReactiveEngine,
} from "../lib/musicReactiveEngine";

describe("musicReactiveEngine", () => {
  let engine: ReactiveEngine | null = null;
  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it("reflects transport state pushed via syncEngineToTransport", () => {
    engine = createReactiveEngine();
    syncEngineToTransport(engine, { isPlaying: true, bpm: 128, beat: 8 });
    const state = engine.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.bpm).toBe(128);
    expect(state.currentBeat).toBe(8);
  });

  it("keeps the seeded beat when paused", () => {
    engine = createReactiveEngine();
    syncEngineToTransport(engine, { isPlaying: false, bpm: 140, beat: 4 });
    const state = engine.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentBeat).toBe(4);
  });

  it("registers agent activity and raises energy on triggerAgent", () => {
    engine = createReactiveEngine();
    expect(engine.getState().energy).toBe(0);
    engine.triggerAgent("rhythm");
    const state = engine.getState();
    expect(state.agentActivity.has("rhythm")).toBe(true);
    expect(state.energy).toBeGreaterThan(0);
  });

  it("records recent bursts with position and color", () => {
    engine = createReactiveEngine();
    engine.triggerBurst(10, 20, 0xff0000, 1);
    const bursts = engine.getState().recentBursts;
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ x: 10, y: 20, color: 0xff0000 });
  });
});
