import { describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { generateAlsXml, exportAbletonLiveSet } from "../lib/abletonExport";

function track(id: string, partial: Partial<Track> = {}): Track {
  return {
    id,
    name: id,
    type: "midi",
    color: "#ff8c42",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips: [],
    automationLanes: [],
    ...partial,
  };
}

function clip(id: string, trackId = "track-1", partial: Partial<Clip> = {}): Clip {
  return {
    id,
    name: id,
    type: "midi",
    trackId,
    start: 8,
    duration: 4,
    loop: false,
    midiData: {
      notes: [
        { pitch: 36, velocity: 100, start: 0, duration: 1 },
        { pitch: 38, velocity: 90, start: 3.5, duration: 0.5 },
      ],
    },
    playback: { instrument: "drum" },
    metadata: { generative: true },
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("generateAlsXml", () => {
  it("produces XML with Ableton root element", () => {
    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [],
      clips: {},
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Ableton MajorVersion="5" MinorVersion="12.0_12117"');
  });

  it("includes BPM in Tempo section", () => {
    const xml = generateAlsXml({
      bpm: 128,
      timeSignature: [4, 4],
      name: "test",
      tracks: [],
      clips: {},
    });
    expect(xml).toContain("<Tempo>");
    expect(xml).toContain('Manual Value="128.000000"');
  });

  it("includes time signature in Signature section", () => {
    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [3, 4],
      name: "test",
      tracks: [],
      clips: {},
    });
    expect(xml).toContain("<Signature>");
    expect(xml).toContain('Numerator Value="3"');
    expect(xml).toContain('Denominator Value="4"');
  });

  it("renders MIDI clips with KeyTrack elements grouping notes by pitch", () => {
    const t = track("track-1", { clips: ["clip-1"] });
    const c = clip("clip-1", "track-1", {
      midiData: {
        notes: [
          { pitch: 36, velocity: 100, start: 0, duration: 1 },
          { pitch: 36, velocity: 95, start: 2, duration: 0.5 },
          { pitch: 38, velocity: 90, start: 3.5, duration: 0.5 },
        ],
      },
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "clip-1": c },
    });

    expect(xml).toContain("<MidiTrack>");
    expect(xml).toContain("<KeyTrack>");
    expect(xml).toContain("<MidiNoteEvent");
    // All note pitches appear
    for (const pitch of [36, 38]) {
      expect(xml).toContain(`Pitch="${pitch}"`);
    }
  });

  it("renders audio clips with SampleRef and relative Samples/ path", () => {
    const t = track("audio-1", { type: "audio", clips: ["sample-1"] });
    const c = clip("sample-1", "audio-1", {
      type: "audio",
      audioFilePath: "/somewhere/kick.wav",
      audioSourceOffset: 0.25,
      audioSourceDuration: 2.0,
      gain: 0.7,
      midiData: undefined,
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "sample-1": c },
    });

    expect(xml).toContain("<AudioTrack>");
    expect(xml).toContain("<SampleRef>");
    expect(xml).toContain("Samples/kick.wav");
    expect(xml).toContain("<FileRef>");
  });

  it("includes track volume, pan, and mute in Mixer section", () => {
    const t = track("track-1", {
      clips: [],
      volume: 0.5,
      pan: -0.3,
      muted: true,
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: {},
    });

    expect(xml).toContain("<Mixer>");
    expect(xml).toContain('Manual Value="0.500000"'); // volume
    expect(xml).toContain('Manual Value="-0.300000"'); // pan
    expect(xml).toContain('<Mute Value="true"');
  });

  it("includes automation lanes in AutomationEnvelopes", () => {
    const t = track("track-1", {
      clips: [],
      automationLanes: [
        {
          id: "lane-1",
          parameter: "volume",
          points: [
            { time: 0, value: 0.8 },
            { time: 8, value: 0.5 },
          ],
        },
      ],
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: {},
    });

    expect(xml).toContain("<AutomationEnvelopes>");
    expect(xml).toContain('<MidiNote Time="0.000000" Value="0.800000"');
    expect(xml).toContain('<MidiNote Time="2.000000" Value="0.500000"');
  });

  it("handles empty session gracefully", () => {
    const xml = generateAlsXml({
      bpm: 120,
      timeSignature: [4, 4],
      name: "empty",
      tracks: [],
      clips: {},
    });
    expect(xml).toContain("<Tracks>");
    expect(xml).toContain("<MasterTrack>");
    expect(xml).not.toContain("<MidiTrack>");
    expect(xml).not.toContain("<AudioTrack>");
  });

  it("outputs valid XML that can be parsed", () => {
    const t = track("track-1", { clips: ["clip-1"] });
    const c = clip("clip-1");

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "clip-1": c },
    });

    // Basic XML well-formedness check
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml.trim().endsWith("</Ableton>")).toBe(true);
    // Opening and closing tags match
    const openCount = (xml.match(/<Ableton /g) || []).length;
    const closeCount = (xml.match(/<\/Ableton>/g) || []).length;
    expect(openCount).toBe(closeCount);
  });

  it("includes master track with volume", () => {
    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [],
      clips: {},
    });

    expect(xml).toContain("<MasterTrack>");
    expect(xml).toContain('Manual Value="0.800000"');
  });

  it("includes track effects in DeviceChain", () => {
    const t = track("track-1", {
      clips: [],
      effects: [
        { id: "fx-1", type: "filter", params: { frequency: 1200 }, bypass: false },
      ],
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: {},
    });

    expect(xml).toContain("<Devices>");
    expect(xml).toContain("filter");
    expect(xml).toContain("frequency");
    expect(xml).toContain("1200");
  });

  it("includes track sends", () => {
    const t = track("track-1", {
      clips: [],
      sends: { reverb: 0.3, delay: 0.7 },
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: {},
    });

    expect(xml).toContain("<Sends>");
    expect(xml).toContain("reverb");
    expect(xml).toContain("delay");
    expect(xml).toContain("0.300000");
    expect(xml).toContain("0.700000");
  });

  it("renders MidiNoteEvent with correct beat-to-quarter conversion", () => {
    const t = track("track-1", { clips: ["clip-1"] });
    const c = clip("clip-1", "track-1", {
      midiData: {
        notes: [
          { pitch: 60, velocity: 100, start: 0, duration: 4 },
        ],
      },
    });

    const xml = generateAlsXml({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "clip-1": c },
    });

    // 0 beats * 0.25 = 0.0, 4 beats * 0.25 = 1.0
    expect(xml).toContain('Time="0.000000"');
    expect(xml).toContain('Duration="1.000000"');
    expect(xml).toContain('Pitch="60"');
    expect(xml).toContain('Velocity="100"');
  });
});

describe("exportAbletonLiveSet", () => {
  it("returns XML and lists audio sample files for copy", async () => {
    const t = track("audio-1", { type: "audio", clips: ["sample-1"] });
    const c = clip("sample-1", "audio-1", {
      type: "audio",
      audioFilePath: "/path/to/sample.wav",
      midiData: undefined,
    });

    const result = await exportAbletonLiveSet({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "sample-1": c },
    });

    expect(result.xml).toContain("<Ableton");
    expect(result.sampleFiles).toHaveLength(1);
    expect(result.sampleFiles[0]).toEqual({
      src: "/path/to/sample.wav",
      destName: "sample.wav",
    });
  });

  it("returns empty sample list when no audio clips exist", async () => {
    const t = track("track-1", { clips: ["clip-1"] });
    const c = clip("clip-1", "track-1");

    const result = await exportAbletonLiveSet({
      bpm: 140,
      timeSignature: [4, 4],
      name: "test",
      tracks: [t],
      clips: { "clip-1": c },
    });

    expect(result.xml).toContain("<Ableton");
    expect(result.sampleFiles).toHaveLength(0);
  });
});
