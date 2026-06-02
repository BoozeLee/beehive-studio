export type EffectType = "reverb" | "delay" | "filter" | "distortion";

export interface EffectInstance {
  id: string;
  type: EffectType;
  params: Record<string, number>;
  bypass: boolean;
}

const DEFAULT_PARAMS: Record<EffectType, Record<string, number>> = {
  reverb: { decay: 2, wet: 0.5, preDelay: 0.01 },
  delay: { delayTime: 0.25, feedback: 0.3, wet: 0.5 },
  filter: { frequency: 1000, Q: 1, type: 0 },
  distortion: { distortion: 0.4, wet: 0.5 },
};

export function createEffect(type: EffectType): EffectInstance {
  return {
    id: crypto.randomUUID(),
    type,
    params: { ...DEFAULT_PARAMS[type] },
    bypass: false,
  };
}

function createReverbImpulseResponse(
  ctx: AudioContext,
  decay: number,
  sampleRate: number
): AudioBuffer {
  const length = sampleRate * decay;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  return impulse;
}

export function createWebAudioEffect(
  ctx: AudioContext,
  instance: EffectInstance
): AudioNode {
  switch (instance.type) {
    case "reverb": {
      const convolver = ctx.createConvolver();
      const wetGain = ctx.createGain();
      const dryGain = ctx.createGain();
      const merger = ctx.createGain();

      const impulse = createReverbImpulseResponse(
        ctx,
        instance.params.decay ?? 2,
        ctx.sampleRate
      );
      convolver.buffer = impulse;
      wetGain.gain.value = instance.params.wet ?? 0.5;
      dryGain.gain.value = 1 - (instance.params.wet ?? 0.5);

      // Dry path
      dryGain.connect(merger);
      // Wet path
      convolver.connect(wetGain);
      wetGain.connect(merger);

      return merger;
    }
    case "delay": {
      const delay = ctx.createDelay(2);
      const feedback = ctx.createGain();
      const wetGain = ctx.createGain();
      const merger = ctx.createGain();

      delay.delayTime.value = instance.params.delayTime ?? 0.25;
      feedback.gain.value = instance.params.feedback ?? 0.3;
      wetGain.gain.value = instance.params.wet ?? 0.5;

      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(merger);

      return merger;
    }
    case "filter": {
      const filter = ctx.createBiquadFilter();
      const types: BiquadFilterType[] = ["lowpass", "highpass", "bandpass"];
      filter.type = types[Math.min(instance.params.type ?? 0, 2)];
      filter.frequency.value = instance.params.frequency ?? 1000;
      filter.Q.value = instance.params.Q ?? 1;
      return filter;
    }
    case "distortion": {
      const shaper = ctx.createWaveShaper();
      const amount = instance.params.distortion ?? 0.4;
      const curve = new Float32Array(44100);
      const deg = Math.PI / 180;
      for (let i = 0; i < 44100; i++) {
        const x = (i * 2) / 44100 - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
      }
      shaper.curve = curve;
      return shaper;
    }
  }
}

export function updateEffectParam(
  instance: EffectInstance,
  param: string,
  value: number
): void {
  instance.params[param] = value;
}

export function buildEffectChain(
  ctx: AudioContext,
  effects: EffectInstance[]
): { input: AudioNode; output: AudioNode; nodes: AudioNode[] } {
  if (effects.length === 0 || effects.every((e) => e.bypass)) {
    const passthrough = ctx.createGain();
    return { input: passthrough, output: passthrough, nodes: [passthrough] };
  }

  const nodes: AudioNode[] = [];
  let lastNode: AudioNode | null = null;

  for (const fx of effects) {
    if (fx.bypass) continue;
    const node = createWebAudioEffect(ctx, fx);
    if (lastNode) {
      lastNode.connect(node);
    }
    lastNode = node;
    nodes.push(node);
  }

  const input = nodes[0];
  const output = lastNode ?? ctx.createGain();

  return { input, output, nodes };
}

export function disposeEffectChain(nodes: AudioNode[]): void {
  for (const node of nodes) {
    node.disconnect();
  }
}

export const EFFECT_LABELS: Record<EffectType, string> = {
  reverb: "Reverb",
  delay: "Delay",
  filter: "Filter",
  distortion: "Distortion",
};

export const EFFECT_COLORS: Record<EffectType, string> = {
  reverb: "#6366f1",
  delay: "#06b6d4",
  filter: "#f59e0b",
  distortion: "#ef4444",
};

export const EFFECT_PARAM_RANGE: Record<
  EffectType,
  Record<string, { min: number; max: number; step: number; label: string }>
> = {
  reverb: {
    decay: { min: 0.1, max: 10, step: 0.1, label: "Decay" },
    wet: { min: 0, max: 1, step: 0.01, label: "Mix" },
    preDelay: { min: 0, max: 0.5, step: 0.001, label: "Pre-delay" },
  },
  delay: {
    delayTime: { min: 0.01, max: 2, step: 0.01, label: "Time" },
    feedback: { min: 0, max: 0.9, step: 0.01, label: "Feedback" },
    wet: { min: 0, max: 1, step: 0.01, label: "Mix" },
  },
  filter: {
    frequency: { min: 20, max: 20000, step: 1, label: "Freq" },
    Q: { min: 0.1, max: 20, step: 0.1, label: "Resonance" },
    type: { min: 0, max: 2, step: 1, label: "Type" },
  },
  distortion: {
    distortion: { min: 0, max: 1, step: 0.01, label: "Amount" },
    wet: { min: 0, max: 1, step: 0.01, label: "Mix" },
  },
};
