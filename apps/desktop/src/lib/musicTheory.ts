// Pure note→note MIDI transforms for the MIDI Tools panel.
// Mirrors the scale/chord tables used by the Python agents
// (agents/melody.py, agents/harmony.py) and lua/lib/music_utils.lua, so a
// user can scale-constrain, chord-generate, arpeggiate, groove, and quantize an
// existing clip. Each transform takes and returns core MidiNote[] (no ids), so
// it round-trips through useTimelineStore.updateClipMidiNotes (M3-undoable).

import type { MidiNote } from "../../../../packages/core-models/index";

export const KEY_ROOTS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

// Semitone intervals from the root.
export const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
};

export type ArpStyle = "up" | "down" | "updown" | "random";

function rootPc(key: string): number {
  return KEY_ROOTS[key] ?? 0;
}

function scalePitchClasses(key: string, scale: string): Set<number> {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.minor;
  const root = rootPc(key);
  return new Set(intervals.map((i) => (root + i) % 12));
}

/** Snap every note's pitch to the nearest pitch in the given key/scale. */
export function constrainToScale(notes: MidiNote[], key: string, scale: string): MidiNote[] {
  const pcs = scalePitchClasses(key, scale);
  return notes.map((n) => {
    if (pcs.has(((n.pitch % 12) + 12) % 12)) return { ...n };
    for (let d = 1; d <= 6; d++) {
      if (pcs.has(((n.pitch - d) % 12 + 12) % 12)) return { ...n, pitch: n.pitch - d };
      if (pcs.has(((n.pitch + d) % 12 + 12) % 12)) return { ...n, pitch: n.pitch + d };
    }
    return { ...n };
  });
}

/**
 * Harmonize each note as a diatonic chord root: add the scale 3rd + 5th
 * (+ 7th when voicing="seventh") stacked above, snapped to the scale.
 */
export function generateChords(
  notes: MidiNote[],
  key: string,
  scale: string,
  voicing: "triad" | "seventh" = "triad"
): MidiNote[] {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.minor;
  const root = rootPc(key);
  // Scale degrees as absolute semitone offsets across two octaves for stacking.
  const ladder: number[] = [];
  for (let oct = 0; oct < 3; oct++) {
    for (const i of intervals) ladder.push(oct * 12 + i);
  }
  const degreesAbove = voicing === "seventh" ? [2, 4, 6] : [2, 4]; // 3rd, 5th(, 7th)

  const out: MidiNote[] = [];
  for (const n of notes) {
    out.push({ ...n });
    // Find n's index in the ladder relative to root pitch class.
    const pc = ((n.pitch - root) % 12 + 12) % 12;
    const baseIdx = ladder.findIndex((v) => v % 12 === pc);
    if (baseIdx < 0) continue;
    for (const step of degreesAbove) {
      const idx = baseIdx + step;
      if (idx < ladder.length) {
        const semis = ladder[idx] - ladder[baseIdx];
        out.push({
          ...n,
          pitch: n.pitch + semis,
          velocity: Math.max(1, Math.round(n.velocity * 0.85)),
        });
      }
    }
  }
  return out;
}

/** Spread simultaneous notes (chords) across time in an arp pattern. */
export function arpeggiate(notes: MidiNote[], style: ArpStyle = "up", rate = 0.25): MidiNote[] {
  // Group by start time (chords played together).
  const groups = new Map<number, MidiNote[]>();
  for (const n of notes) {
    const key = Math.round(n.start * 1000) / 1000;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(n);
  }
  const out: MidiNote[] = [];
  for (const [start, group] of groups) {
    if (group.length === 1) {
      out.push({ ...group[0] });
      continue;
    }
    const sorted = [...group].sort((a, b) => a.pitch - b.pitch);
    let order: MidiNote[];
    switch (style) {
      case "down":
        order = [...sorted].reverse();
        break;
      case "updown":
        order = [...sorted, ...[...sorted].reverse().slice(1, -1)];
        break;
      case "random":
        order = [...sorted].sort(() => Math.random() - 0.5);
        break;
      default:
        order = sorted;
    }
    order.forEach((n, i) => {
      out.push({ ...n, start: start + i * rate, duration: rate });
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Apply swing (delay off-beat 8ths), density thinning, and downbeat accents. */
export function applyGroove(
  notes: MidiNote[],
  opts: { swing?: number; density?: number; darkness?: number } = {}
): MidiNote[] {
  const swing = Math.max(0, Math.min(1, opts.swing ?? 0));
  const density = Math.max(0, Math.min(1, opts.density ?? 1));
  const darkness = Math.max(0, Math.min(1, opts.darkness ?? 0));
  const swingShift = swing * 0.5 * 0.33; // up to ~1/3 of an 8th
  const out: MidiNote[] = [];
  notes.forEach((n, idx) => {
    if (density < 1 && idx % 2 === 1 && Math.random() > density) return; // thin
    const eighth = Math.round((n.start % 1) / 0.5);
    const offbeat = Math.abs((n.start % 0.5) - 0.25) < 1e-6 || eighth % 2 === 1;
    const onDownbeat = Math.abs(n.start % 1) < 1e-6;
    out.push({
      ...n,
      start: offbeat ? n.start + swingShift : n.start,
      velocity: Math.max(
        1,
        Math.min(127, Math.round(n.velocity * (onDownbeat ? 1.0 : 0.9) - darkness * 10))
      ),
      pitch: darkness > 0.5 && n.pitch > 24 ? n.pitch - 12 : n.pitch,
    });
  });
  return out;
}

/** Snap note starts (and clamp durations) to a grid division in beats. */
export function quantizeNotes(notes: MidiNote[], grid = 0.25): MidiNote[] {
  if (grid <= 0) return notes.map((n) => ({ ...n }));
  return notes.map((n) => ({
    ...n,
    start: Math.max(0, Math.round(n.start / grid) * grid),
    duration: Math.max(grid, Math.round(n.duration / grid) * grid),
  }));
}
