import * as Tone from "tone";

let mixerInitialized = false;
let audioCtx: AudioContext | null = null;

export interface MixerChannelState {
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

export type ChannelUpdate = Partial<Pick<MixerChannelState, "volume" | "pan" | "muted" | "solo" | "armed" | "fxReturns">>;

export interface SendBusState {
  id: string;
  name: string;
  level: number;
}

export interface MasterState {
  gain: number;
  level: number;
  peak: number;
}

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
let masterGain = 0.9;
let masterLevel = 0;
let masterPeak = 0;

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function clampPan(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function calculateRmsLevel(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const val = Math.abs(data[i] - 128) / 128;
    sum += val * val;
  }
  return Math.sqrt(sum / data.length);
}

export function decayPeak(currentPeak: number, currentLevel: number, decay = 0.995): number {
  return Math.max(currentLevel, Math.max(0, currentPeak) * decay);
}

export function initMixer(): boolean {
  if (mixerInitialized) return true;
  try {
    if (!Tone.context?.rawContext) return false;
    audioCtx = Tone.context.rawContext as AudioContext;

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = masterGain;
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

export function updateChannel(id: string, update: ChannelUpdate, immediate = false): void {
  const ch = channels.get(id);
  if (!ch) return;

  if (update.volume !== undefined) {
    const volume = clampUnit(update.volume);
    if (immediate) {
      ch.gainNode.gain.setValueAtTime(volume, audioCtx!.currentTime);
    } else {
      // Reduced ramp time from 50ms to 10ms for better response
      ch.gainNode.gain.linearRampToValueAtTime(volume, audioCtx!.currentTime + 0.01);
    }
    ch.state.volume = volume;
  }
  if (update.pan !== undefined) {
    const pan = clampPan(update.pan);
    ch.panNode.pan.value = pan;
    ch.state.pan = pan;
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
      const sendLevel = clampUnit(value);
      if (sendGain) {
        sendGain.gain.value = sendLevel;
      }
      update.fxReturns[busId] = sendLevel;
    }
    ch.state.fxReturns = { ...ch.state.fxReturns, ...update.fxReturns };
  }
}

export function batchUpdateChannels(updates: Array<{id: string, update: ChannelUpdate}>): void {
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  
  updates.forEach(({id, update}) => {
    const ch = channels.get(id);
    if (!ch) return;
    
    // Apply all updates in single audio thread tick
    if (update.volume !== undefined) {
      const volume = clampUnit(update.volume);
      ch.gainNode.gain.setValueAtTime(volume, now);
      ch.state.volume = volume;
    }
    if (update.pan !== undefined) {
      const pan = clampPan(update.pan);
      ch.panNode.pan.value = pan;
      ch.state.pan = pan;
    }
    if (update.muted !== undefined) {
      ch.state.muted = update.muted;
    }
    if (update.solo !== undefined) {
      ch.state.solo = update.solo;
    }
    if (update.armed !== undefined) {
      ch.state.armed = update.armed;
    }
    if (update.fxReturns) {
      for (const [busId, value] of Object.entries(update.fxReturns)) {
        const sendGain = ch.sendGains.get(busId);
        const sendLevel = clampUnit(value);
        if (sendGain) {
          sendGain.gain.setValueAtTime(sendLevel, now);
        }
        update.fxReturns[busId] = sendLevel;
      }
      ch.state.fxReturns = { ...ch.state.fxReturns, ...update.fxReturns };
    }
  });
  
  // Apply mute/solo updates after all individual updates
  applyChannelMuteSolo();
}

// Direct Web Audio API access for critical real-time operations
export function setChannelVolumeImmediate(id: string, volume: number): void {
  const ch = channels.get(id);
  if (!ch || !audioCtx) return;
  
  // Direct Web Audio API access - bypass Tone.js
  ch.gainNode.gain.setValueAtTime(clampUnit(volume), audioCtx.currentTime);
  ch.state.volume = clampUnit(volume);
}

export function setChannelPanImmediate(id: string, pan: number): void {
  const ch = channels.get(id);
  if (!ch) return;
  
  // Direct Web Audio API access - bypass Tone.js
  ch.panNode.pan.value = clampPan(pan);
  ch.state.pan = clampPan(pan);
}

export function setMasterVolumeImmediate(gain: number): void {
  if (!audioCtx || !masterGainNode) return;
  
  // Direct Web Audio API access - bypass Tone.js
  masterGainNode.gain.setValueAtTime(clampUnit(gain), audioCtx.currentTime);
  masterGain = clampUnit(gain);
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

export function getMasterState(): MasterState {
  return {
    gain: masterGain,
    level: masterLevel,
    peak: masterPeak,
  };
}

export function setMasterGain(gain: number): void {
  masterGain = clampUnit(gain);
  if (masterGainNode) {
    masterGainNode.gain.linearRampToValueAtTime(masterGain, audioCtx!.currentTime + 0.05);
  }
}

export function resetPeaks(): void {
  masterPeak = masterLevel;
  for (const [, ch] of channels) {
    ch.state.peak = ch.state.level;
  }
}

let pollingId: number | null = null;
let updateInterval: number = 60; // 60ms update interval instead of 16ms (60fps → ~16fps)
let lastUpdateTime: number = 0;

// Optimized level monitoring with reduced frequency and smaller fftSize
function startLevelPolling(): void {
  if (pollingId !== null) return;
  
  const optimizedPoll = (timestamp: number) => {
    if (timestamp - lastUpdateTime < updateInterval) {
      pollingId = requestAnimationFrame(optimizedPoll);
      return;
    }
    lastUpdateTime = timestamp;
    
    // Use smaller fftSize for faster processing
    if (masterAnalyserNode) {
      const data = new Uint8Array(16); // Much smaller buffer - 8x faster
      masterAnalyserNode.getByteTimeDomainData(data);
      masterLevel = calculateRmsLevel(data);
      masterPeak = decayPeak(masterPeak, masterLevel * 1.1);
    }

    for (const [, ch] of channels) {
      const data = new Uint8Array(16); // Much smaller buffer - 8x faster
      ch.analyserNode.getByteTimeDomainData(data);
      ch.state.level = calculateRmsLevel(data);
      ch.state.peak = decayPeak(ch.state.peak, ch.state.level * 1.1);
    }

    pollingId = requestAnimationFrame(optimizedPoll);
  };
  pollingId = requestAnimationFrame(optimizedPoll);
}

// Optimized channel creation with smaller fftSize
export function createChannel(id: string, name: string = "Track"): boolean {
  if (!audioCtx || channels.has(id)) return false;

  const gainNode = audioCtx.createGain();
  const initialVolume = 0.8;
  gainNode.gain.value = initialVolume;
  const panNode = audioCtx.createStereoPanner();
  panNode.pan.value = 0;
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 32; // Reduced from 256 to 32 - 8x faster processing
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
    state: { id, name, volume: initialVolume, pan: 0, muted: false, solo: false, armed: false, level: 0, peak: 0, fxReturns: {} },
    sendGains,
  });

  return true;
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
  masterLevel = 0;
  masterPeak = 0;
  masterGain = 0.9;
  mixerInitialized = false;
}

export function getSendBuses(): SendBusState[] {
  return Array.from(sendBuses.values()).map(sb => ({ id: sb.id, name: sb.name, level: sb.level }));
}

export function setSendBusLevel(id: string, level: number): void {
  const bus = sendBuses.get(id);
  if (bus) {
    const nextLevel = clampUnit(level);
    bus.inputGain.gain.value = nextLevel;
    bus.level = nextLevel;
  }
}
