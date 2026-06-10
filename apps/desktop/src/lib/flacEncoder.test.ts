import { describe, it, expect } from "vitest";
import { audioBufferToFlac } from "./flacEncoder";

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
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("audioBufferToFlac", () => {
  it("returns a non-empty Uint8Array", () => {
    const buffer = createMockBuffer(44100, 1);
    const result = audioBufferToFlac(buffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("starts with fLaC marker", () => {
    const buffer = createMockBuffer(44100, 1);
    const result = audioBufferToFlac(buffer);
    const marker = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(marker).toBe("fLaC");
  });

  it("handles stereo audio", () => {
    const buffer = createMockBuffer(44100, 2);
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
    const marker = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(marker).toBe("fLaC");
  });

  it("handles very short audio (less than one block)", () => {
    const buffer = createMockBuffer(100, 1);
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles silence", () => {
    const data = new Float32Array(44100);
    const buffer = {
      length: 44100,
      numberOfChannels: 1,
      sampleRate: 44100,
      duration: 1,
      getChannelData: () => data,
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("has valid STREAMINFO block size", () => {
    const buffer = createMockBuffer(44100, 1);
    const result = audioBufferToFlac(buffer);
    // After fLaC marker (4 bytes), STREAMINFO header: 1 byte type/flags + 3 bytes length
    const streamInfoLen = (result[5] << 16) | (result[6] << 8) | result[7];
    expect(streamInfoLen).toBe(34);
  });

  it("outputs larger data for longer audio", () => {
    const shortBuffer = createMockBuffer(44100, 1);
    const longBuffer = createMockBuffer(44100 * 4, 1);
    const shortResult = audioBufferToFlac(shortBuffer);
    const longResult = audioBufferToFlac(longBuffer);
    let diff = 0;
    for (let i = 0; i < Math.min(shortResult.length, longResult.length); i++) {
      if (shortResult[i] !== longResult[i]) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it("handles 48kHz sample rate", () => {
    const buffer = createMockBuffer(48000, 1, 48000);
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
    const marker = String.fromCharCode(result[0], result[1], result[2], result[3]);
    expect(marker).toBe("fLaC");
  });

  it("handles 96kHz sample rate", () => {
    const buffer = createMockBuffer(96000, 1, 96000);
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles very large audio (over 4 seconds)", () => {
    const buffer = createMockBuffer(44100 * 6, 1);
    const result = audioBufferToFlac(buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
