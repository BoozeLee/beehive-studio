import * as Tone from "tone";
import type { RowConfig, StepData } from "./patternTypes";

let isInitialized = false;
let isPlaying = false;
let repeatEventId: number | null = null;
const synths = new Map<string, Tone.MembraneSynth | Tone.PolySynth>();

function init(): void {
  if (isInitialized) return;
  isInitialized = true;
}

function getSynth(row: RowConfig): Tone.MembraneSynth | Tone.PolySynth {
  const existing = synths.get(row.id);
  if (existing) return existing;

  const isDrum = ["kick", "snare", "hihat-c", "hihat-o", "clap", "tom-h", "tom-m", "rim"].includes(row.id);
  const synth: Tone.MembraneSynth | Tone.PolySynth = isDrum
    ? new Tone.MembraneSynth({
        pitchDecay: row.id.includes("hat") ? 0.02 : 0.05,
        octaves: row.id === "kick" ? 10 : 2,
        oscillator: { type: row.id.includes("hat") ? "square" : "sine" },
        envelope: {
          attack: 0.001,
          decay: row.id.includes("hat") ? 0.05 : 0.2,
          sustain: 0,
          release: row.id.includes("hat") ? 0.05 : 0.2,
        },
      }).toDestination()
    : new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
      }).toDestination();

  synth.volume.value = -8;
  synths.set(row.id, synth);
  return synth;
}

export function isPatternPreviewPlaying(): boolean {
  return isPlaying;
}

export function stopPatternPreview(): void {
  if (!isPlaying) return;
  if (repeatEventId !== null) {
    Tone.Transport.clear(repeatEventId);
    repeatEventId = null;
  }
  Tone.Transport.stop();
  isPlaying = false;
}

export function previewPattern(
  rows: RowConfig[],
  steps: Record<string, StepData[]>,
  bpm: number,
  resolution: number,
  swing: number
): void {
  stopPatternPreview();
  init();

  Tone.Transport.bpm.value = bpm;
  const loopDuration = steps[rows[0]?.id]?.length ?? 16;
  if (loopDuration <= 0) return;

  repeatEventId = Tone.Transport.scheduleRepeat((time) => {
    const transportSeconds = Tone.Transport.seconds;
    const patternBeat = (transportSeconds * bpm) / 60;
    const stepIndex = Math.floor(patternBeat / resolution) % loopDuration;

    for (const row of rows) {
      const rowSteps = steps[row.id];
      if (!rowSteps) continue;
      const step = rowSteps[stepIndex];
      if (!step?.active) continue;

      const isOffbeat = stepIndex % 2 === 1;
      const swingOffset = isOffbeat ? (swing / 100) * resolution * 0.5 : 0;
      const velocity = Math.max(0, Math.min(1, step.velocity / 127));
      const synth = getSynth(row);
      const duration = row.id.includes("hat") ? "32n" : "16n";
      synth.triggerAttackRelease(row.pitch, duration, time + swingOffset, velocity);
    }
  }, "16n");

  Tone.Transport.start();
  isPlaying = true;
}

export function disposePatternPlayer(): void {
  stopPatternPreview();
  for (const synth of synths.values()) {
    synth.dispose();
  }
  synths.clear();
  isInitialized = false;
}
