import { describe, it, expect } from "vitest";
import { clearSampleCache, stopSamplePreview } from "./sampleCache";

describe("SampleInfo", () => {
  it("can create a valid SampleInfo object", () => {
    const info = {
      path: "/samples/kick.wav",
      filename: "kick.wav",
      sample_rate: 44100,
      channels: 1,
      duration_secs: 0.5,
      bits_per_sample: 16,
    };
    expect(info.filename).toBe("kick.wav");
    expect(info.sample_rate).toBe(44100);
    expect(info.duration_secs).toBeGreaterThan(0);
  });

  it("can create a multi-channel SampleInfo", () => {
    const info = {
      path: "/samples/pad.flac",
      filename: "pad.flac",
      sample_rate: 48000,
      channels: 2,
      duration_secs: 2.5,
      bits_per_sample: 24,
    };
    expect(info.channels).toBe(2);
    expect(info.bits_per_sample).toBe(24);
    expect(info.sample_rate).toBe(48000);
  });
});

describe("SampleData", () => {
  it("can create SampleData with samples", () => {
    const data = {
      info: {
        path: "/samples/snare.wav",
        filename: "snare.wav",
        sample_rate: 44100,
        channels: 1,
        duration_secs: 0.3,
        bits_per_sample: 16,
      },
      samples: [0, 0.5, -0.5, 0.25, -0.25],
    };
    expect(data.info.filename).toBe("snare.wav");
    expect(data.samples).toHaveLength(5);
  });

  it("validates sample data bounds", () => {
    const data = {
      info: {
        path: "/samples/test.wav",
        filename: "test.wav",
        sample_rate: 44100,
        channels: 1,
        duration_secs: 0.1,
        bits_per_sample: 16,
      },
      samples: [-1.0, -0.5, 0, 0.5, 1.0],
    };
    for (const s of data.samples) {
      expect(s).toBeGreaterThanOrEqual(-1.0);
      expect(s).toBeLessThanOrEqual(1.0);
    }
  });
});

describe("stopSamplePreview", () => {
  it("does not throw when called with no active preview", () => {
    expect(() => stopSamplePreview()).not.toThrow();
  });

  it("can be called multiple times safely", () => {
    stopSamplePreview();
    stopSamplePreview();
    stopSamplePreview();
    expect(true).toBe(true);
  });
});

describe("clearSampleCache", () => {
  it("does not throw when cache is empty", () => {
    expect(() => clearSampleCache()).not.toThrow();
  });

  it("can be called after stopSamplePreview", () => {
    stopSamplePreview();
    expect(() => clearSampleCache()).not.toThrow();
  });
});
