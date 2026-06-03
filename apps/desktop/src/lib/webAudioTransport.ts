import { useState, useCallback, useEffect } from "react";
import { profilerStart, profilerEnd } from "./profiler";

export interface TransportState {
  isPlaying: boolean;
  bpm: number;
  currentBeat: number;
  isReady: boolean;
}

export interface ScheduledClip {
  id: string;
  notes: Array<{
    pitch: number;
    velocity: number;
    start: number;
    duration: number;
  }>;
  startBeat: number;
  loop: boolean;
  channel: number;
}

interface ScheduledNote {
  audioStartTime: number;
  audioEndTime: number;
  pitch: number;
  velocity: number;
  channel: number;
  clipId: string;
}

const MAX_VOICES = 128; // 32 tracks × 4 voice polyphony

class AudioVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  inUse = false;

  constructor(ctx: AudioContext) {
    this.oscillator = ctx.createOscillator();
    this.oscillator.type = "sawtooth";
    this.oscillator.start();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.oscillator.connect(this.gain);
  }

  triggerNote(
    startTime: number,
    duration: number,
    pitch: number,
    velocity: number
  ) {
    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    const attackTime = 0.005;
    const releaseTime = 0.08;
    const sustainLevel = 0.7;
    const noteEnd = startTime + duration;
    const releaseEnd = noteEnd + releaseTime;

    this.oscillator.frequency.setValueAtTime(freq, startTime);
    this.gain.gain.cancelScheduledValues(startTime);
    this.gain.gain.setValueAtTime(0, startTime);
    this.gain.gain.linearRampToValueAtTime(velocity, startTime + attackTime);
    this.gain.gain.setValueAtTime(velocity * sustainLevel, noteEnd);
    this.gain.gain.linearRampToValueAtTime(0, releaseEnd);
    this.inUse = true;
  }

  stop(cleanupTime: number) {
    this.gain.gain.cancelScheduledValues(cleanupTime);
    this.gain.gain.setValueAtTime(0, cleanupTime);
    this.inUse = false;
  }

  isFree(): boolean {
    return !this.inUse;
  }
}

class VoicePool {
  private voices: AudioVoice[] = [];
  private ctx: AudioContext;

  constructor(ctx: AudioContext, maxVoices: number = MAX_VOICES) {
    this.ctx = ctx;
    this.allocate(maxVoices);
  }

  private allocate(count: number) {
    for (let i = 0; i < count; i++) {
      const voice = new AudioVoice(this.ctx);
      voice.gain.connect(this.ctx.destination);
      this.voices.push(voice);
    }
  }

  acquire(): AudioVoice | null {
    // Find a free voice
    const free = this.voices.find((v) => v.isFree());
    if (free) return free;

    // Voice stealing: steal the first voice (oldest scheduled)
    if (this.voices.length > 0) {
      const stolen = this.voices[0];
      stolen.stop(this.ctx.currentTime);
      return stolen;
    }

    return null;
  }

  releaseAll() {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.stop(now);
    }
  }

  dispose() {
    for (const voice of this.voices) {
      try {
        voice.oscillator.stop();
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      } catch {}
    }
    this.voices = [];
  }
}

class WebAudioTransport {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private bpm = 142;
  private startTime = 0;
  private currentBeatOffset = 0;
  private stateListeners: Array<(state: TransportState) => void> = [];
  private scheduledNotes: ScheduledNote[] = [];
  private voicePool: VoicePool | null = null;
  private processorTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScheduledAudioTime = 0;
  private automationCallback: ((currentBeat: number, audioTime: number) => void) | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private useWorklet = false;

  private readonly LOOK_AHEAD = 0.2; // Schedule 200ms ahead
  private readonly SCHEDULE_INTERVAL = 0.05; // Check every 50ms

  constructor() {
    this.scheduleTick();
  }

  private getSecondsPerBeat(): number {
    return 60 / this.bpm;
  }

  private getBeatsFromSeconds(seconds: number): number {
    return seconds / this.getSecondsPerBeat();
  }

  private getSecondsFromBeats(beats: number): number {
    return beats * this.getSecondsPerBeat();
  }

  private scheduleTick() {
    requestAnimationFrame(() => {
      this.updateState();
      this.scheduleTick();
    });
  }

  private updateState() {
    let currentBeat = 0;
    if (this.isPlaying && this.audioContext) {
      const elapsedSeconds = this.audioContext.currentTime - this.startTime;
      currentBeat = this.currentBeatOffset + this.getBeatsFromSeconds(elapsedSeconds);
    } else {
      currentBeat = this.currentBeatOffset;
    }

    this.notifyListeners({
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      currentBeat,
      isReady: this.audioContext !== null,
    });
  }

  private notifyListeners(state: TransportState) {
    this.stateListeners.forEach((listener) => listener(state));
  }

  subscribe(listener: (state: TransportState) => void) {
    this.stateListeners.push(listener);
    this.updateState();
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  private getOrCreateVoice(): AudioVoice | null {
    if (!this.voicePool) return null;
    return this.voicePool.acquire();
  }

  async start() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.voicePool = new VoicePool(this.audioContext, MAX_VOICES);

      // Initialize AudioWorklet if enabled
      if (this.useWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule("/audio-processor.js");
          this.workletNode = new AudioWorkletNode(this.audioContext, "beehive-processor");
          this.workletNode.connect(this.audioContext.destination);
          console.log("[AudioWorklet] Initialized successfully");
        } catch (err) {
          console.warn("[AudioWorklet] Failed to load, falling back to main thread:", err);
          this.useWorklet = false;
          this.workletNode = null;
        }
      }
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    if (!this.isPlaying) {
      this.isPlaying = true;
      if (this.currentBeatOffset > 0) {
        this.startTime =
          this.audioContext.currentTime -
          this.getSecondsFromBeats(this.currentBeatOffset);
      } else {
        this.startTime = this.audioContext.currentTime;
      }

      this.lastScheduledAudioTime = this.audioContext.currentTime;
      this.audioProcessorLoop();
    }
  }

  setUseWorklet(enabled: boolean): void {
    this.useWorklet = enabled;
  }

  setAutomationCallback(cb: ((currentBeat: number, audioTime: number) => void) | null): void {
    this.automationCallback = cb;
  }

  private audioProcessorLoop() {
    if (!this.isPlaying || !this.audioContext) return;

    if (this.useWorklet && this.workletNode) {
      const now = this.audioContext.currentTime;
      const scheduleUntil = now + this.LOOK_AHEAD;
      const toSchedule = this.scheduledNotes.filter(
        (n) => n.audioStartTime >= this.lastScheduledAudioTime &&
              n.audioStartTime <= scheduleUntil && n.audioStartTime >= now
      );
      for (const note of toSchedule) {
        const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
        this.workletNode.port.postMessage({
          type: "noteOn", frequency: freq, velocity: note.velocity / 127,
          duration: note.audioEndTime - note.audioStartTime,
        });
      }
      this.lastScheduledAudioTime = scheduleUntil;
      if (this.automationCallback) {
        const currentBeat = this.currentBeatOffset + this.getBeatsFromSeconds(now - this.startTime);
        this.automationCallback(currentBeat, now);
      }
      this.processorTimer = setTimeout(() => this.audioProcessorLoop(), this.SCHEDULE_INTERVAL * 1000);
      return;
    }

    profilerStart("transport:tick");
    const now = this.audioContext.currentTime;
    const scheduleUntil = now + this.LOOK_AHEAD;

    if (this.automationCallback) {
      profilerStart("transport:automationApply");
      const currentBeat = this.currentBeatOffset + this.getBeatsFromSeconds(now - this.startTime);
      this.automationCallback(currentBeat, now);
      profilerEnd("transport:automationApply");
    }

    const toSchedule = this.scheduledNotes.filter(
      (n) => n.audioStartTime >= this.lastScheduledAudioTime &&
            n.audioStartTime <= scheduleUntil && n.audioStartTime >= now
    );

    for (const note of toSchedule) {
      profilerStart("transport:noteTrigger");
      const voice = this.getOrCreateVoice();
      if (voice) voice.triggerNote(note.audioStartTime, note.audioEndTime - note.audioStartTime, note.pitch, note.velocity / 127);
      profilerEnd("transport:noteTrigger");
    }

    this.lastScheduledAudioTime = scheduleUntil;
    profilerEnd("transport:tick");
    this.processorTimer = setTimeout(() => this.audioProcessorLoop(), this.SCHEDULE_INTERVAL * 1000);
  }

  pause() {
    if (this.isPlaying && this.audioContext) {
      this.isPlaying = false;
      this.currentBeatOffset = this.getBeatsFromSeconds(
        this.audioContext.currentTime - this.startTime
      );
      if (this.processorTimer) {
        clearTimeout(this.processorTimer);
        this.processorTimer = null;
      }
    }
  }

  stop() {
    this.isPlaying = false;
    this.currentBeatOffset = 0;
    this.startTime = 0;
    this.scheduledNotes = [];
    this.lastScheduledAudioTime = 0;

    if (this.processorTimer) {
      clearTimeout(this.processorTimer);
      this.processorTimer = null;
    }

    if (this.voicePool) {
      this.voicePool.releaseAll();
    }
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  scheduleClip(clip: ScheduledClip) {
    if (!this.audioContext) return;

    // Remove existing notes for this clip
    this.scheduledNotes = this.scheduledNotes.filter(
      (n) => n.clipId !== clip.id
    );

    const secondsPerBeat = this.getSecondsPerBeat();
    const baseTime = this.getSecondsFromBeats(clip.startBeat);

    // Convert relative clip timing to absolute audio time
    for (const note of clip.notes) {
      this.scheduledNotes.push({
        audioStartTime: baseTime + note.start * secondsPerBeat,
        audioEndTime: baseTime + (note.start + note.duration) * secondsPerBeat,
        pitch: note.pitch,
        velocity: note.velocity,
        channel: clip.channel,
        clipId: clip.id,
      });
    }

    if (clip.loop) {
      const loopDurationBeats = Math.max(
        ...clip.notes.map((n) => n.start + n.duration)
      );
      const loopDurationSeconds = loopDurationBeats * secondsPerBeat;
      const totalLoopTime = 300; // Pre-schedule up to 5 minutes

      let loopStart = baseTime + loopDurationSeconds;
      while (loopStart < baseTime + totalLoopTime) {
        for (const note of clip.notes) {
          this.scheduledNotes.push({
            audioStartTime: loopStart + note.start * secondsPerBeat,
            audioEndTime:
              loopStart + (note.start + note.duration) * secondsPerBeat,
            pitch: note.pitch,
            velocity: note.velocity,
            channel: clip.channel,
            clipId: clip.id,
          });
        }
        loopStart += loopDurationSeconds;
      }
    }

    // Re-sort by audio start time
    this.scheduledNotes.sort((a, b) => a.audioStartTime - b.audioStartTime);
  }

  unscheduleClip(clipId: string) {
    this.scheduledNotes = this.scheduledNotes.filter(
      (n) => n.clipId !== clipId
    );
  }

  clearAll() {
    this.scheduledNotes = [];
    this.lastScheduledAudioTime = 0;

    if (this.voicePool) {
      this.voicePool.releaseAll();
    }

    if (this.processorTimer) {
      clearTimeout(this.processorTimer);
      this.processorTimer = null;
    }
  }

  getState(): TransportState {
    let currentBeat = 0;
    if (this.isPlaying && this.audioContext) {
      const elapsedSeconds = this.audioContext.currentTime - this.startTime;
      currentBeat =
        this.currentBeatOffset + this.getBeatsFromSeconds(elapsedSeconds);
    } else {
      currentBeat = this.currentBeatOffset;
    }

    return {
      isPlaying: this.isPlaying,
      bpm: this.bpm,
      currentBeat,
      isReady: this.audioContext !== null,
    };
  }
}

let transportInstance: WebAudioTransport | null = null;

export function getTransportInstance(): WebAudioTransport {
  if (!transportInstance) {
    transportInstance = new WebAudioTransport();
  }
  return transportInstance;
}

export function useTransport() {
  const transport = getTransportInstance();
  const [state, setState] = useState<TransportState>(transport.getState());

  useEffect(() => {
    return transport.subscribe(setState);
  }, [transport]);

  const play = useCallback(() => transport.start(), []);
  const pause = useCallback(() => transport.pause(), []);
  const stop = useCallback(() => transport.stop(), []);
  const setBpm = useCallback((bpm: number) => transport.setBpm(bpm), []);
  const scheduleClip = useCallback(
    (clip: ScheduledClip) => transport.scheduleClip(clip),
    []
  );
  const unscheduleClip = useCallback(
    (clipId: string) => transport.unscheduleClip(clipId),
    []
  );
  const clearAll = useCallback(() => transport.clearAll(), []);
  const setAutomationCallback = useCallback(
    (cb: ((currentBeat: number, audioTime: number) => void) | null) => transport.setAutomationCallback(cb),
    []
  );
  const enableWorklet = useCallback(
    (enabled: boolean) => transport.setUseWorklet(enabled),
    []
  );

  return {
    ...state,
    play,
    pause,
    stop,
    setBpm,
    scheduleClip,
    unscheduleClip,
    clearAll,
    setAutomationCallback,
    enableWorklet,
  };
}
