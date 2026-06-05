import * as Tone from "tone";

let mixerInitialized = false;
let audioCtx: AudioContext | null = null;

interface MixerChannelState {
  id: string;
  name: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  level: number;
  peak: number;
  fxReturns: Record<string, number>;
}

type ChannelUpdate = Partial<Pick<MixerChannelState, "volume" | "pan" | "muted" | "solo" | "armed" | "fxReturns">>;

interface SendBus {
  id: string;
  name: string;
  inputGain: GainNode;
  outputGain: GainNode;
  dispose: () => void;
  level: number;
}

const channels = new Map<string, {
  gainNode: GainNode;
  panNode: StereoPannerNode;
  analyserNode: AnalyserNode;
  muteGain: GainNode;
  inputNode: GainNode;
  state: MixerChannelState;
  sendGains: Map<string, GainNode>;
}>();

const sendBuses = new Map<string, SendBus>();

let masterGainNode: GainNode | null = null;
let masterAnalyserNode: AnalyserNode | null = null;
let masterLevel = 0;
let masterPeak = 0;

export function initMixer(): boolean {
  if (mixerInitialized) return true;
  try {
    if (!Tone.context?.rawContext) return false;
    audioCtx = Tone.context.rawContext as AudioContext;

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = 0.9;
    masterAnalyserNode = audioCtx.createAnalyser();
    masterAnalyserNode.fftSize = 256;
    masterGainNode.connect(masterAnalyserNode);
    masterAnalyserNode.connect(audioCtx.destination);

    createReverbBus("reverb", "Reverb");
    createDelayBus("delay", "Delay");

    mixerInitialized = true;
    startLevelPolling();
    return true;
  } catch {
    return false;
  }
}

function createReverbBus(id: string, name: string) {
  if (!audioCtx) return;
  const inputGain = audioCtx.createGain();
  inputGain.gain.value = 1;
  const outputGain = audioCtx.createGain();
  outputGain.gain.value = 1;

  const convolver = audioCtx.createConvolver();
  convolver.buffer = createImpulseResponse(audioCtx, 2.6, 2.2);
  inputGain.connect(convolver);
  convolver.connect(outputGain);
  outputGain.connect(masterGainNode!);

  sendBuses.set(id, {
    id,
    name,
    inputGain,
    outputGain,
    dispose: () => {
      inputGain.disconnect();
      convolver.disconnect();
      outputGain.disconnect();
    },
    level: 1,
  });
}

function createDelayBus(id: string, name: string) {
  if (!audioCtx) return;
  const inputGain = audioCtx.createGain();
  inputGain.gain.value = 1;
  const outputGain = audioCtx.createGain();
  outputGain.gain.value = 0.8;
  const delay = audioCtx.createDelay(2);
  delay.delayTime.value = 0.375;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.32;

  inputGain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(outputGain);
  outputGain.connect(masterGainNode!);

  sendBuses.set(id, {
    id,
    name,
    inputGain,
    outputGain,
    dispose: () => {
      inputGain.disconnect();
      delay.disconnect();
      feedback.disconnect();
      outputGain.disconnect();
    },
    level: 0.8,
  });
}

function createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const tail = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(tail, decay);
    }
  }
  return impulse;
}

export function createChannel(id: string, name: string = "Track"): boolean {
  if (!audioCtx || channels.has(id)) return false;

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.8;
  const panNode = audioCtx.createStereoPanner();
  panNode.pan.value = 0;
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 1;
  const inputNode = audioCtx.createGain();
  inputNode.gain.value = 1;

  inputNode.connect(gainNode);
  gainNode.connect(panNode);
  panNode.connect(analyserNode);
  analyserNode.connect(muteGain);
  muteGain.connect(masterGainNode!);

  const sendGains = new Map<string, GainNode>();
  for (const [busId] of sendBuses) {
    const sendGain = audioCtx.createGain();
    sendGain.gain.value = 0;
    muteGain.connect(sendGain);
    sendGain.connect(sendBuses.get(busId)!.inputGain);
    sendGains.set(busId, sendGain);
  }

  channels.set(id, {
    gainNode, panNode, analyserNode, muteGain, inputNode,
    state: { id, name, volume: 0.8, pan: 0, muted: false, solo: false, armed: false, level: 0, peak: 0, fxReturns: {} },
    sendGains,
  });

  return true;
}

export function removeChannel(id: string): void {
  const ch = channels.get(id);
  if (!ch) return;
  try {
    ch.gainNode.disconnect();
    ch.panNode.disconnect();
    ch.analyserNode.disconnect();
    ch.muteGain.disconnect();
    ch.inputNode.disconnect();
    ch.sendGains.forEach(sg => sg.disconnect());
  } catch { /* ok */ }
  channels.delete(id);
}

export function updateChannel(id: string, update: ChannelUpdate): void {
  const ch = channels.get(id);
  if (!ch) return;

  if (update.volume !== undefined) {
    ch.gainNode.gain.linearRampToValueAtTime(update.volume, audioCtx!.currentTime + 0.05);
    ch.state.volume = update.volume;
  }
  if (update.pan !== undefined) {
    ch.panNode.pan.value = update.pan;
    ch.state.pan = update.pan;
  }
  if (update.muted !== undefined) {
    ch.state.muted = update.muted;
    applyChannelMuteSolo();
  }
  if (update.solo !== undefined) {
    ch.state.solo = update.solo;
    applyChannelMuteSolo();
  }
  if (update.armed !== undefined) {
    ch.state.armed = update.armed;
  }
  if (update.fxReturns) {
    for (const [busId, value] of Object.entries(update.fxReturns)) {
      const sendGain = ch.sendGains.get(busId);
      if (sendGain) {
        sendGain.gain.value = value;
      }
    }
    ch.state.fxReturns = { ...ch.state.fxReturns, ...update.fxReturns };
  }
}

function applyChannelMuteSolo(): void {
  if (!audioCtx) return;
  const hasSolo = Array.from(channels.values()).some(ch => ch.state.solo);
  for (const [, ch] of channels) {
    const audible = !ch.state.muted && (!hasSolo || ch.state.solo);
    ch.muteGain.gain.linearRampToValueAtTime(
      audible ? 1 : 0,
      audioCtx.currentTime + 0.01
    );
  }
}

export function getInputNode(id: string): GainNode | undefined {
  return channels.get(id)?.inputNode;
}

export function getChannelState(id: string): MixerChannelState | undefined {
  return channels.get(id)?.state;
}

export function getAllChannelStates(): MixerChannelState[] {
  return Array.from(channels.values()).map(c => c.state);
}

export function getMasterLevel(): number {
  return masterLevel;
}

export function getMasterPeak(): number {
  return masterPeak;
}

export function setMasterGain(gain: number): void {
  if (masterGainNode) {
    masterGainNode.gain.linearRampToValueAtTime(gain, audioCtx!.currentTime + 0.05);
  }
}

let pollingId: number | null = null;

function startLevelPolling(): void {
  if (pollingId !== null) return;
  const poll = () => {
    if (masterAnalyserNode) {
      const data = new Uint8Array(masterAnalyserNode.frequencyBinCount);
      masterAnalyserNode.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const val = Math.abs(data[i] - 128) / 128;
        sum += val * val;
      }
      masterLevel = Math.sqrt(sum / data.length);
      masterPeak = Math.max(masterPeak, masterLevel * 1.1);
      masterPeak *= 0.995;
    }

    for (const [, ch] of channels) {
      const data = new Uint8Array(ch.analyserNode.frequencyBinCount);
      ch.analyserNode.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const val = Math.abs(data[i] - 128) / 128;
        sum += val * val;
      }
      ch.state.level = Math.sqrt(sum / data.length);
      ch.state.peak = Math.max(ch.state.peak, ch.state.level * 1.1);
      ch.state.peak *= 0.995;
    }

    pollingId = requestAnimationFrame(poll);
  };
  pollingId = requestAnimationFrame(poll);
}

export function disposeMixer(): void {
  if (pollingId !== null) {
    cancelAnimationFrame(pollingId);
    pollingId = null;
  }
  sendBuses.forEach(sb => {
    try { sb.dispose(); } catch { /* ok */ }
  });
  sendBuses.clear();
  channels.forEach(ch => removeChannel(ch.state.id));
  if (masterGainNode) {
    try { masterGainNode.disconnect(); } catch { /* ok */ }
    masterGainNode = null;
  }
  if (masterAnalyserNode) {
    try { masterAnalyserNode.disconnect(); } catch { /* ok */ }
    masterAnalyserNode = null;
  }
  mixerInitialized = false;
}

export function getSendBuses(): Array<{ id: string; name: string }> {
  return Array.from(sendBuses.values()).map(sb => ({ id: sb.id, name: sb.name }));
}

export function setSendBusLevel(id: string, level: number): void {
  const bus = sendBuses.get(id);
  if (bus) {
    bus.inputGain.gain.value = level;
    bus.level = level;
  }
}
