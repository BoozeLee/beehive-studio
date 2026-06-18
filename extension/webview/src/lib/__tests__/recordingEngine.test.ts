import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("tone", () => ({
  Transport: {
    seconds: 0,
    bpm: { value: 120 },
  },
}));

import * as Tone from "tone";
import {
  requestAudioPermission,
  requestMidiAccess,
  startAudioRecording,
  stopAudioRecording,
  startMidiRecording,
  stopMidiRecording,
  resetRecordingEngine,
} from "../recordingEngine";

class MockMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  mimeType = "audio/webm";

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public stream: MediaStream,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public options?: Record<string, string>
  ) {}

  start(_timeslice?: number) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["fake-audio"], { type: this.mimeType }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  static isTypeSupported(type: string) {
    return type === "audio/webm";
  }
}

function createMockStream(): MediaStream {
  const tracks: MediaStreamTrack[] = [{ stop: vi.fn() } as unknown as MediaStreamTrack];
  return { getTracks: () => tracks } as unknown as MediaStream;
}

describe("recordingEngine", () => {
  beforeEach(() => {
    resetRecordingEngine();
    Tone.Transport.seconds = 0;
    Tone.Transport.bpm.value = 120;

    const mockStream = createMockStream();
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    };

    Object.defineProperty(globalThis, "navigator", {
      value: {
        ...globalThis.navigator,
        mediaDevices,
      },
      configurable: true,
    });

    Object.defineProperty(globalThis, "MediaRecorder", {
      value: MockMediaRecorder,
      configurable: true,
    });
  });

  describe("audio", () => {
    it("requests audio permission", async () => {
      const ok = await requestAudioPermission();
      expect(ok).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it("starts and stops an audio recording", async () => {
      await startAudioRecording();
      const result = await stopAudioRecording(0, 120);
      expect(result).toBeDefined();
      expect(result?.mimeType).toBe("audio/webm");
      expect(result?.blob.size).toBeGreaterThan(0);
    });

    it("returns undefined when stopped without data", async () => {
      // Override MediaRecorder to emit no data.
      class EmptyMediaRecorder extends MockMediaRecorder {
        stop() {
          this.state = "inactive";
          if (this.onstop) this.onstop();
        }
      }
      Object.defineProperty(globalThis, "MediaRecorder", {
        value: EmptyMediaRecorder,
        configurable: true,
      });
      await startAudioRecording();
      const result = await stopAudioRecording(0, 120);
      expect(result).toBeUndefined();
    });
  });

  describe("MIDI", () => {
    let mockInput: { onmidimessage: ((event: MIDIMessageEvent) => void) | null };

    beforeEach(() => {
      mockInput = { onmidimessage: null };
      const inputs = new Map([["input-1", mockInput]]);
      Object.defineProperty(globalThis.navigator, "requestMIDIAccess", {
        value: vi.fn().mockResolvedValue({ inputs }),
        configurable: true,
      });
    });

    it("requests MIDI access", async () => {
      const ok = await requestMidiAccess();
      expect(ok).toBe(true);
      expect(navigator.requestMIDIAccess).toHaveBeenCalled();
    });

    it("records note-on/note-off pairs", async () => {
      await startMidiRecording();
      expect(mockInput.onmidimessage).toBeTypeOf("function");

      Tone.Transport.seconds = 0;
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]) } as MIDIMessageEvent);

      Tone.Transport.seconds = 0.5;
      mockInput.onmidimessage?.({ data: new Uint8Array([0x80, 60, 0]) } as MIDIMessageEvent);

      Tone.Transport.seconds = 0.5;
      const result = stopMidiRecording(0, 120);

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]).toEqual({
        pitch: 60,
        velocity: 100,
        start: 0,
        duration: 1,
      });
    });

    it("treats note-on with zero velocity as note-off", async () => {
      await startMidiRecording();

      Tone.Transport.seconds = 0;
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 64, 80]) } as MIDIMessageEvent);

      Tone.Transport.seconds = 1;
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 64, 0]) } as MIDIMessageEvent);

      const result = stopMidiRecording(0, 120);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].duration).toBe(2);
    });

    it("closes held notes at stop time", async () => {
      await startMidiRecording();

      Tone.Transport.seconds = 0;
      mockInput.onmidimessage?.({ data: new Uint8Array([0x90, 67, 90]) } as MIDIMessageEvent);

      Tone.Transport.seconds = 1.5;
      const result = stopMidiRecording(0, 120);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].start).toBe(0);
      expect(result.notes[0].duration).toBe(3);
    });
  });
});
