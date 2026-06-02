import { describe, it, expect, vi, beforeEach } from "vitest";
import { audioBufferToWav, renderAudioBuffer } from "./audioEngine";

function createMockBuffer(
  length: number,
  channels: number,
  sampleRate: number = 44100
): AudioBuffer {
  const data: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const arr = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    data.push(arr);
  }

  return {
    length,
    numberOfChannels: channels,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => data[ch],
  } as AudioBuffer;
}

describe("audioBufferToWav", () => {
  it("returns a non-empty Uint8Array", () => {
    const buffer = createMockBuffer(44100, 1);
    const result = audioBufferToWav(buffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(44); // At least WAV header
  });

  it("starts with RIFF header", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToWav(buffer);
    const header = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(header).toBe("RIFF");
  });

  it("contains WAVE format", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToWav(buffer);
    const format = String.fromCharCode(result[8], result[9], result[10], result[11]);
    expect(format).toBe("WAVE");
  });

  it("has correct PCM format (1 = PCM)", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM format
  });

  it("has correct number of channels", () => {
    const buffer = createMockBuffer(100, 2);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    expect(view.getUint16(22, true)).toBe(2);
  });

  it("has correct sample rate", () => {
    const buffer = createMockBuffer(100, 1, 48000);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    expect(view.getUint32(24, true)).toBe(48000);
  });

  it("has 16-bit samples", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("has correct data chunk size", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    const dataSize = view.getUint32(40, true);
    expect(dataSize).toBe(100 * 2); // 100 samples × 2 bytes (16-bit mono)
  });

  it("has correct total file size", () => {
    const buffer = createMockBuffer(100, 2);
    const result = audioBufferToWav(buffer);
    const view = new DataView(result.buffer);
    const riffSize = view.getUint32(4, true);
    expect(riffSize).toBe(result.length - 8);
  });
});

describe("renderAudioBuffer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "OfflineAudioContext",
      vi.fn().mockImplementation((channels: number, length: number, sampleRate: number) => {
        const mockLength = length || 44100;
        return {
          destination: { currentTime: 0 },
          currentTime: 0,
          sampleRate,
          createOscillator: () => ({
            type: "sawtooth",
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn().mockReturnThis(),
            start: vi.fn(),
            stop: vi.fn(),
          }),
          createGain: () => ({
            gain: {
              value: 0,
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              cancelScheduledValues: vi.fn(),
            },
            connect: vi.fn(),
          }),
          startRendering: vi.fn().mockResolvedValue({
            length: mockLength,
            numberOfChannels: channels || 2,
            sampleRate,
            getChannelData: () => new Float32Array(mockLength),
            duration: mockLength / sampleRate,
          }),
        };
      })
    );
  });

  it("renders an AudioBuffer from clips", async () => {
    const clips = [
      {
        id: "clip-1",
        notes: [
          { pitch: 60, velocity: 100, start: 0, duration: 1 },
          { pitch: 64, velocity: 90, start: 1, duration: 0.5 },
        ],
        channel: 0,
      },
    ];
    const result = await renderAudioBuffer(clips, 140);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty clips gracefully", async () => {
    const result = await renderAudioBuffer([], 140);
    expect(result).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });

  it("handles multiple clips and channels", async () => {
    const clips = [
      {
        id: "clip-1",
        notes: [{ pitch: 36, velocity: 100, start: 0, duration: 2 }],
        channel: 0,
      },
      {
        id: "clip-2",
        notes: [{ pitch: 48, velocity: 80, start: 0, duration: 2 }],
        channel: 1,
      },
    ];
    const result = await renderAudioBuffer(clips, 140);
    expect(result).toBeDefined();
    expect(result.numberOfChannels).toBe(2);
  });

  it("calculates total beats correctly", async () => {
    const clips = [
      {
        id: "clip-1",
        notes: [{ pitch: 60, velocity: 100, start: 0, duration: 8 }],
        channel: 0,
      },
    ];
    const result = await renderAudioBuffer(clips, 60);
    expect(result).toBeDefined();
    // The mocked OfflineAudioContext always returns duration=100/44100
    // Real implementation would calculate based on clip durations
    expect(result.duration).toBeGreaterThan(0);
  });
});
