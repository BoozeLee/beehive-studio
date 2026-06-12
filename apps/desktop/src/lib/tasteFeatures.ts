export interface MidiNoteLike {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

export function extractFeatures(notes: MidiNoteLike[]): number[] {
  if (!notes.length) return new Array(8).fill(0);
  const pitches = notes.map((n) => n.pitch);
  const velocities = notes.map((n) => n.velocity);
  const durations = notes.map((n) => n.duration);
  const starts = notes.map((n) => n.start);

  const hist = new Array(12).fill(0);
  pitches.forEach((p) => hist[p % 12]++);
  const total = hist.reduce((a, b) => a + b, 0) || 1;

  const span = Math.max(...starts) + Math.max(...durations) || 1;
  const density = notes.length / span;

  return [
    hist.slice(0, 3).reduce((a, b) => a + b, 0) / total,
    hist.slice(3, 6).reduce((a, b) => a + b, 0) / total,
    hist.slice(6, 9).reduce((a, b) => a + b, 0) / total,
    hist.slice(9, 12).reduce((a, b) => a + b, 0) / total,
    Math.min(1, density / 8),
    velocities.reduce((a, b) => a + b, 0) / velocities.length / 127,
    Math.min(1, durations.reduce((a, b) => a + b, 0) / durations.length / 4),
    pitches.reduce((a, b) => a + b, 0) / pitches.length / 127,
  ];
}
