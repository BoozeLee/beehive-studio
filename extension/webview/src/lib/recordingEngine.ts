import * as Tone from "tone";
import type { MidiNote } from "./desktopTypes";

export type RecordingType = "audio" | "midi";

export interface AudioRecordingResult {
  blob: Blob;
  mimeType: string;
}

export interface MidiRecordingResult {
  notes: MidiNote[];
}

interface ActiveMidiNote {
  startSeconds: number;
  velocity: number;
}

let audioStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingMimeType = "audio/webm";

let midiAccess: MIDIAccess | null = null;
const activeMidiNotes = new Map<number, ActiveMidiNote>();
const midiEvents: MidiNote[] = [];
let midiStartSeconds = 0;
let midiBpm = 120;

function preferredAudioMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function midiNoteToBeat(seconds: number, startSeconds: number, bpm: number): number {
  return (seconds - startSeconds) * (bpm / 60);
}

export async function requestAudioPermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export async function requestMidiAccess(): Promise<boolean> {
  if (typeof navigator === "undefined" || !(navigator as unknown as { requestMIDIAccess?: () => Promise<MIDIAccess> }).requestMIDIAccess) {
    return false;
  }
  try {
    midiAccess = await (navigator as unknown as { requestMIDIAccess: () => Promise<MIDIAccess> }).requestMIDIAccess();
    return true;
  } catch {
    return false;
  }
}

export function isRecording(): boolean {
  return mediaRecorder?.state === "recording" || midiEvents.length > 0 || activeMidiNotes.size > 0;
}

export async function startAudioRecording(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Audio recording is not supported in this environment.");
  }
  if (mediaRecorder?.state === "recording") {
    return;
  }

  audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  recordingMimeType = preferredAudioMimeType() || "audio/webm";

  const options = recordingMimeType ? { mimeType: recordingMimeType } : undefined;
  mediaRecorder = new MediaRecorder(audioStream, options);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    audioStream?.getTracks().forEach((track) => track.stop());
    audioStream = null;
  };

  mediaRecorder.onerror = (event) => {
    console.error("[recordingEngine] MediaRecorder error:", event);
  };

  mediaRecorder.start(100);
}

export async function stopAudioRecording(startBeat: number, bpm: number): Promise<AudioRecordingResult | undefined> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      resolve(undefined);
      return;
    }

    const recorder = mediaRecorder;
    const finalize = () => {
      audioStream?.getTracks().forEach((track) => track.stop());
      audioStream = null;
      mediaRecorder = null;

      if (recordedChunks.length === 0) {
        resolve(undefined);
        return;
      }

      const blob = new Blob(recordedChunks, { type: recordingMimeType });
      recordedChunks = [];
      resolve({ blob, mimeType: recordingMimeType });
    };

    recorder.onstop = () => {
      // startBeat/bpm are reserved for future clip-bound calculations; finalize handles cleanup.
      void startBeat;
      void bpm;
      finalize();
    };

    recorder.onerror = (event) => {
      reject(new Error(`MediaRecorder error: ${String(event)}`));
    };

    if (recorder.state === "recording") {
      recorder.stop();
    } else {
      finalize();
    }
  });
}

function handleMidiMessage(event: MIDIMessageEvent, startSeconds: number, bpm: number): void {
  const data = event.data;
  if (!data || data.length < 3) return;

  const status = data[0] & 0xf0;
  const pitch = data[1];
  const velocity = data[2];
  const nowSeconds = Tone.Transport.seconds;

  if (status === 0x90 && velocity > 0) {
    activeMidiNotes.set(pitch, { startSeconds: nowSeconds, velocity });
  } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    const active = activeMidiNotes.get(pitch);
    if (!active) return;

    const durationSeconds = Math.max(0, nowSeconds - active.startSeconds);
    const startBeat = midiNoteToBeat(active.startSeconds, startSeconds, bpm);
    const durationBeats = durationSeconds * (bpm / 60);

    midiEvents.push({
      pitch,
      velocity: active.velocity,
      start: Math.max(0, startBeat),
      duration: Math.max(0.01, durationBeats),
    });
    activeMidiNotes.delete(pitch);
  }
}

export async function startMidiRecording(): Promise<void> {
  if (typeof navigator === "undefined" || !(navigator as unknown as { requestMIDIAccess?: () => Promise<MIDIAccess> }).requestMIDIAccess) {
    throw new Error("MIDI recording is not supported in this environment.");
  }

  if (!midiAccess) {
    midiAccess = await (navigator as unknown as { requestMIDIAccess: () => Promise<MIDIAccess> }).requestMIDIAccess();
  }

  midiStartSeconds = Tone.Transport.seconds;
  midiBpm = Tone.Transport.bpm.value;
  midiEvents.length = 0;
  activeMidiNotes.clear();

  midiAccess.inputs.forEach((input) => {
    input.onmidimessage = (event) => {
      handleMidiMessage(event as MIDIMessageEvent, midiStartSeconds, midiBpm);
    };
  });
}

export function stopMidiRecording(startSeconds: number, bpm: number): MidiRecordingResult {
  // Close any still-held notes at the current transport time.
  const nowSeconds = Tone.Transport.seconds;
  activeMidiNotes.forEach((active, pitch) => {
    const durationSeconds = Math.max(0, nowSeconds - active.startSeconds);
    const startBeat = midiNoteToBeat(active.startSeconds, startSeconds, bpm);
    const durationBeats = durationSeconds * (bpm / 60);

    midiEvents.push({
      pitch,
      velocity: active.velocity,
      start: Math.max(0, startBeat),
      duration: Math.max(0.01, durationBeats),
    });
  });
  activeMidiNotes.clear();

  // Detach listeners.
  midiAccess?.inputs.forEach((input) => {
    input.onmidimessage = null;
  });

  return { notes: midiEvents.slice() };
}

export function resetRecordingEngine(): void {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  audioStream?.getTracks().forEach((track) => track.stop());
  audioStream = null;
  mediaRecorder = null;
  recordedChunks = [];
  activeMidiNotes.clear();
  midiEvents.length = 0;
  midiAccess?.inputs.forEach((input) => {
    input.onmidimessage = null;
  });
  midiAccess = null;
}
