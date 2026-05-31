import * as Tone from "tone";

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

export function createToneEffect(
  instance: EffectInstance
): Tone.ToneAudioNode {
  switch (instance.type) {
    case "reverb":
      return new Tone.Reverb({
        decay: instance.params.decay ?? 2,
        preDelay: instance.params.preDelay ?? 0.01,
        wet: instance.params.wet ?? 0.5,
      });
    case "delay":
      return new Tone.FeedbackDelay({
        delayTime: instance.params.delayTime ?? 0.25,
        feedback: instance.params.feedback ?? 0.3,
        wet: instance.params.wet ?? 0.5,
      });
    case "filter": {
      const types = ["lowpass", "highpass", "bandpass"] as const;
      return new Tone.Filter({
        frequency: instance.params.frequency ?? 1000,
        Q: instance.params.Q ?? 1,
        type: types[Math.min(instance.params.type ?? 0, 2)] ?? "lowpass",
      });
    }
    case "distortion":
      return new Tone.Distortion({
        distortion: instance.params.distortion ?? 0.4,
        wet: instance.params.wet ?? 0.5,
      });
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
  effects: EffectInstance[]
): { chain: Tone.ToneAudioNode[]; nodes: Map<string, Tone.ToneAudioNode> } {
  const chain: Tone.ToneAudioNode[] = [];
  const nodes = new Map<string, Tone.ToneAudioNode>();

  for (const fx of effects) {
    if (fx.bypass) continue;
    const node = createToneEffect(fx);
    chain.push(node);
    nodes.set(fx.id, node);
  }

  return { chain, nodes };
}

export function disposeEffectChain(
  nodes: Map<string, Tone.ToneAudioNode>
): void {
  for (const node of nodes.values()) {
    node.dispose();
  }
  nodes.clear();
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