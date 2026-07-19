export interface BurstEvent {
  time: number;
  x: number;
  y: number;
  color: number;
  intensity: number;
}

export interface ReactiveState {
  isPlaying: boolean;
  currentBeat: number;
  bpm: number;
  beatPhase: number;
  barPhase: number;
  energy: number;
  pulseValue: number;
  agentActivity: Map<string, number>;
  recentBursts: BurstEvent[];
  bassKick: boolean;
  snareHit: boolean;
  hihatTick: boolean;
}

export type ReactiveListener = (state: ReactiveState) => void;

const AGENT_DECAY_MS = 2000;
const BURST_LIFETIME_MS = 800;

export function createReactiveEngine() {
  let isPlaying = false;
  let currentBeat = 0;
  let bpm = 140;
  let energy = 0;
  const agentActivity = new Map<string, number>();
  const recentBursts: BurstEvent[] = [];
  const listeners = new Set<ReactiveListener>();
  let rafId = 0;
  let lastTime = performance.now();
  let prevBeatFloor = -1;

  function getState(): ReactiveState {
    const now = performance.now();
    const beatPhase = currentBeat % 1;
    return {
      isPlaying,
      currentBeat,
      bpm,
      beatPhase,
      barPhase: (currentBeat % 4) / 4,
      energy,
      pulseValue: Math.sin(currentBeat * Math.PI * 2) * 0.5 + 0.5,
      agentActivity: new Map(agentActivity),
      recentBursts: recentBursts.filter((b) => now - b.time < BURST_LIFETIME_MS),
      bassKick: isPlaying && Math.floor(currentBeat) !== prevBeatFloor && currentBeat % 4 < 0.01,
      snareHit: isPlaying && Math.floor(currentBeat) % 2 === 1 && prevBeatFloor % 2 === 0,
      hihatTick: isPlaying && (currentBeat % 0.5) < 0.05,
    };
  }

  function tick(now: number) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const floor = Math.floor(currentBeat);
    prevBeatFloor = floor;

    if (isPlaying) {
      const spb = 60 / bpm;
      currentBeat += dt / spb;
    }

    for (const [agent, t] of agentActivity) {
      if (now - t > AGENT_DECAY_MS) agentActivity.delete(agent);
    }

    energy = Math.max(0, energy - dt * 1.5);

    const state = getState();
    for (const fn of listeners) fn(state);
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function setPlaying(playing: boolean, beat?: number) {
    isPlaying = playing;
    if (beat !== undefined) currentBeat = beat;
    prevBeatFloor = Math.floor(currentBeat);
  }

  function setBpm(v: number) { bpm = v; }
  function setBeat(beat: number) { currentBeat = beat; }

  function triggerAgent(agentId: string) {
    agentActivity.set(agentId, performance.now());
    energy = Math.min(1, energy + 0.3);
  }

  function triggerBurst(x: number, y: number, color: number, intensity = 1) {
    recentBursts.push({ time: performance.now(), x, y, color, intensity });
    energy = Math.min(1, energy + 0.4);
  }

  function subscribe(fn: ReactiveListener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    listeners.clear();
  }

  start();

  return {
    setPlaying, setBeat, setBpm, triggerAgent, triggerBurst, subscribe, destroy, getState,
  };
}

export type ReactiveEngine = ReturnType<typeof createReactiveEngine>;

export interface TransportSnapshot {
  isPlaying: boolean;
  bpm: number;
  beat: number;
}

/**
 * Push the app's transport state into a reactive engine. The engine advances the
 * beat itself between calls, so this only needs to run on play/pause and BPM
 * changes, re-seeding the current beat each time.
 */
export function syncEngineToTransport(engine: ReactiveEngine, t: TransportSnapshot) {
  engine.setBpm(t.bpm);
  engine.setPlaying(t.isPlaying, t.beat);
}
