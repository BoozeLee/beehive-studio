import '@testing-library/jest-dom';
import { beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
  emit: vi.fn().mockResolvedValue(undefined),
}));

// Mock Tauri plugins
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

// Mock Tone.js
vi.mock('tone', () => ({
  Transport: {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    bpm: { value: 142 },
  },
  Player: vi.fn().mockImplementation(() => ({
    toDestination: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  Synth: vi.fn(),
  Sampler: vi.fn(),
  loaded: Promise.resolve(),
}));

// Mock zustand
vi.mock('zustand', () => ({
  create: vi.fn((fn) => fn(() => ({
    tracks: [],
    clips: {},
    selectedTrackId: null,
    selectedClipId: null,
    cursorPosition: 0,
    zoom: 16,
    scrollOffset: { x: 0, y: 0 },
    snapToGrid: true,
    gridDivision: 1,
    setTracks: vi.fn(),
    addTrack: vi.fn(),
    updateTrack: vi.fn(),
    removeTrack: vi.fn(),
    setClips: vi.fn(),
    addClip: vi.fn(),
    updateClip: vi.fn(),
    removeClip: vi.fn(),
    selectTrack: vi.fn(),
    selectClip: vi.fn(),
    setCursorPosition: vi.fn(),
    setZoom: vi.fn(),
    setScrollOffset: vi.fn(),
    setSnapToGrid: vi.fn(),
  }))),
}));

// Global test utilities
(global as { beforeEach?: unknown }).beforeEach = beforeEach;
(global as { afterEach?: unknown }).afterEach = afterEach;

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// Performance helpers
export const measureRenderTime = async (fn: () => void | Promise<void>) => {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return end - start;
};

// Async test helper with timeout
export const waitFor = (condition: () => boolean, timeout = 1000) => {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
};

// Mock data generators
export const createMockClip = (overrides = {}) => ({
  id: `clip-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Clip',
  duration: 4,
  color: '#ff8c42',
  midiData: {
    notes: [
      { pitch: 60, velocity: 100, start: 0, duration: 1 },
      { pitch: 64, velocity: 90, start: 1, duration: 1 },
      { pitch: 67, velocity: 95, start: 2, duration: 2 },
    ],
  },
  reasoning: [],
  ...overrides,
});

export const createMockTrack = (overrides = {}) => ({
  id: `track-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Track',
  type: 'midi' as const,
  color: '#ff8c42',
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  arm: false,
  clips: [],
  automationLanes: [],
  ...overrides,
});

export const createMockNote = (overrides = {}) => ({
  pitch: 60 + Math.floor(Math.random() * 24),
  velocity: 80 + Math.floor(Math.random() * 40),
  start: Math.random() * 8,
  duration: 0.5 + Math.random() * 2,
  ...overrides,
});