import type { Track, Clip, ID } from "../../../../packages/core-models/index";

interface ExportSession {
  bpm: number;
  timeSignature: [number, number];
  name: string;
  tracks: Track[];
  clips: Record<ID, Clip>;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function tag(name: string, attrs: Record<string, string | number | boolean>, inner = ""): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${xmlEscape(String(v))}"`)
    .join("");
  if (inner === "") return `<${name}${attrStr} />`;
  return `<${name}${attrStr}>${inner}</${name}>`;
}

function floatAttr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toFixed(6);
}

function colorToAbleton(hex: string | undefined): number {
  if (!hex) return 100;
  const num = parseInt(hex.replace("#", ""), 16);
  if (isNaN(num)) return 100;
  return num;
}

function buildMidiClipXml(clip: Clip): string {
  const notesByPitch = new Map<number, NonNullable<Clip["midiData"]>["notes"]>();
  for (const note of clip.midiData?.notes ?? []) {
    const existing = notesByPitch.get(note.pitch) ?? [];
    existing.push(note);
    notesByPitch.set(note.pitch, existing);
  }

  const keyTracksXml = Array.from(notesByPitch.entries())
    .sort(([a], [b]) => a - b)
    .map(([, notes]) => {
      const eventsXml = notes
        .sort((a, b) => a.start - b.start)
        .map((n) =>
          tag("MidiNoteEvent", {
            Time: floatAttr(n.start * 0.25),
            Duration: floatAttr(n.duration * 0.25),
            Pitch: n.pitch,
            Velocity: n.velocity,
            VelocityDevice: n.velocity,
            Mute: false,
          })
        )
        .join("\n");
      return tag("KeyTrack", {}, tag("MidiNoteEvents", {}, "\n" + eventsXml + "\n"));
    })
    .join("\n");

  const noteClipsXml = keyTracksXml
    ? tag("ClipEnvelope", { DefaultValue: 0.0 }) +
      tag("Notes", {}, "\n" + keyTracksXml + "\n")
    : "";

  return (
    tag("ClipSlot", {},
      tag("ClipSlot::Clip", { Time: 0.0 },
        tag("ClipSlot::Clip::ClipTimeable", {},
          tag("LomId", { Value: 0 }) +
          tag("LomIdView", { Value: 0 }) +
          tag("Id", { Value: clip.id }) +
          tag("Name", { Value: xmlEscape(clip.name) }) +
          tag("Annotation", { Value: "" }) +
          tag("CurrentStart", { Value: floatAttr(clip.start * 0.25) }) +
          tag("CurrentEnd", { Value: floatAttr((clip.start + clip.duration) * 0.25) }) +
          (clip.color ? tag("Color", { Value: colorToAbleton(clip.color) }) : "") +
          tag("WarpMode", { Value: 0 }) +
          tag("WarpStart", { Value: 0.0 }) +
          tag("WarpEnd", { Value: floatAttr(clip.duration * 0.25) }) +
          tag("WarpInfo", {}) +
          tag("LoopStart", { Value: 0.0 }) +
          tag("LoopEnd", { Value: floatAttr(clip.duration * 0.25) }) +
          tag("WarpMarkers", {}) +
          tag("StartOffset", { Value: 0.0 }) +
          tag("Gain", { Value: floatAttr(clip.gain ?? 1) }) +
          tag("Groove", { Value: "" }) +
          tag("HiQ", { Value: true }) +
          tag("Mute", { Value: false }) +
          tag("PitchFinetune", { Value: 0 }) +
          tag("PitchCoarse", { Value: 0 }) +
          tag("PianoRollShowGrid", { Value: false }) +
          tag("SignedRefCount", { Value: 0 }) +
          tag("TimeSelectionStart", { Value: floatAttr(clip.start * 0.25) }) +
          tag("TimeSelectionEnd", { Value: floatAttr((clip.start + clip.duration) * 0.25) }) +
          tag("RelativePath", { Value: "" }) +
          tag("Hide", { Value: false }) +
          tag("Warping", { Value: false }) +
          tag("WarpMode", { Value: 0 }) +
          tag("WarpStartCrop", { Value: 0.0 }) +
          tag("Loop", { Value: clip.loop ? 1 : 0 }) +
          tag("RecursiveWarpNext", { Value: false }) +
          tag("WarpLoop", { Value: true }) +
          tag("PropertyList", {},
            tag("TransportOrder", { Value: 1 })
          )
        ) +
        tag("ClipSlot::Clip::Timeable", {},
          tag("ArrangerAutomation", {},
            tag("Events", {},
              tag("TimeAutomation", {},
                tag("MuteEvents", {})
              ) +
              tag("PitchCoarseEvents", {}) +
              tag("PitchFinetuneEvents", {})
            )
          )
        ) +
        tag("ClipSlot::Clip::MidiClip", {},
          tag("SampleType", { Value: 0 }) +
          tag("SampleRef", {}) +
          tag("MidiOpener", { Value: 1 }) +
          tag("VelocityAmount", { Value: 100.0 }) +
          tag("MpegSlaveMode", { Value: 1 }) +
          tag("TimeSelection", {}) +
          noteClipsXml +
          tag("MidiClip::SavedMidiClip", { Value: 1 })
        ) +
        tag("ClipSlot::Clip::Loop", {}) +
        tag("ClipSlot::Clip::Groove", {}) +
        tag("ClipSlot::Clip::ClipEnvelopeChoices", {}) +
        tag("ClipSlot::Clip::Supplementary", {})
      )
    )
  );
}

function buildAudioClipXml(clip: Clip): string {
  const sampleFileName = clip.audioFilePath?.split(/[/\\]/).pop() ?? `${clip.id}.wav`;
  return (
    tag("ClipSlot", {},
      tag("ClipSlot::Clip", { Time: floatAttr(clip.start * 0.25) },
        tag("ClipSlot::Clip::ClipTimeable", {},
          tag("LomId", { Value: 0 }) +
          tag("LomIdView", { Value: 0 }) +
          tag("Id", { Value: clip.id }) +
          tag("Name", { Value: xmlEscape(clip.name) }) +
          tag("Annotation", { Value: "" }) +
          tag("CurrentStart", { Value: floatAttr(clip.start * 0.25) }) +
          tag("CurrentEnd", { Value: floatAttr((clip.start + clip.duration) * 0.25) }) +
          (clip.color ? tag("Color", { Value: colorToAbleton(clip.color) }) : "") +
          tag("WarpMode", { Value: 0 }) +
          tag("WarpStart", { Value: floatAttr(clip.audioSourceOffset ?? 0) }) +
          tag("WarpEnd", { Value: floatAttr((clip.audioSourceOffset ?? 0) + (clip.audioSourceDuration ?? clip.duration * 0.25)) }) +
          tag("LoopStart", { Value: 0.0 }) +
          tag("LoopEnd", { Value: floatAttr(clip.duration * 0.25) }) +
          tag("StartOffset", { Value: floatAttr(clip.audioSourceOffset ?? 0) }) +
          tag("Gain", { Value: floatAttr(clip.gain ?? 1) }) +
          tag("HiQ", { Value: true }) +
          tag("Mute", { Value: false }) +
          tag("Loop", { Value: clip.loop ? 1 : 0 }) +
          tag("Warping", { Value: true }) +
          tag("SampleType", { Value: 1 }) +
          tag("RelativePath", { Value: "Samples/" + xmlEscape(sampleFileName) })
        ) +
        tag("ClipSlot::Clip::AudioClip", {},
          tag("SampleRef", {},
            tag("FileRef", {},
              tag("Path", { Dir: xmlEscape("Samples/"), Rel: xmlEscape(sampleFileName) }) +
              tag("Type", { Value: 1 }) +
              tag("FileType", { Value: 0 }) +
              tag("FileSize", { Value: 0 }) +
              tag("Crc", { Value: 0 }) +
              tag("OriginalFileSize", { Value: 0 }) +
              tag("OriginalCrc", { Value: 0 }) +
              tag("HasSavedExtraInfo", { Value: 1 }) +
              tag("Id", { Value: clip.id + "-ref" })
            )
          ) +
          tag("ClipTimeable", {}) +
          tag("Timeable", {}) +
          tag("WarpMode", { Value: 0 }) +
          tag("ComplexProg", { Value: 0 }) +
          tag("TransientMode", { Value: 0 }) +
          tag("WarpMarkers", {}) +
          tag("Loop", {})
        )
      )
    )
  );
}

function buildClipSlotXml(clip: Clip): string {
  if (clip.type === "audio" && clip.audioFilePath) {
    return buildAudioClipXml(clip);
  }
  if (clip.midiData && clip.midiData.notes.length > 0) {
    return buildMidiClipXml(clip);
  }
  return tag("ClipSlot", {}, tag("ClipSlot::Clip", { Time: floatAttr(clip.start * 0.25) },
    tag("ClipSlot::Clip::ClipTimeable", {},
      tag("LomId", { Value: 0 }) +
      tag("LomIdView", { Value: 0 }) +
      tag("Id", { Value: clip.id }) +
      tag("Name", { Value: xmlEscape(clip.name) }) +
      tag("Annotation", { Value: "" }) +
      tag("CurrentStart", { Value: floatAttr(clip.start * 0.25) }) +
      tag("CurrentEnd", { Value: floatAttr((clip.start + clip.duration) * 0.25) }) +
      (clip.color ? tag("Color", { Value: colorToAbleton(clip.color) }) : "") +
      tag("SampleType", { Value: 0 }) +
      tag("Mute", { Value: false }) +
      tag("Loop", { Value: 0 }) +
      tag("Warping", { Value: false })
    ) +
    tag("ClipSlot::Clip::MidiClip", {},
      tag("SampleRef", {}) +
      tag("MidiOpener", { Value: 0 }) +
      tag("MpegSlaveMode", { Value: 1 })
    )
  ));
}

function buildAutomationEnvelopes(track: Track): string {
  if (track.automationLanes.length === 0) return "<AutomationEnvelopes />";

  const lanesXml = track.automationLanes.map((lane) => {
    const pointsXml = lane.points
      .sort((a, b) => a.time - b.time)
      .map((p) =>
        tag("MidiClip", {},
          tag("MidiNote", { Time: floatAttr(p.time * 0.25), Value: floatAttr(p.value), Mute: false })
        )
      )
      .join("\n");
    return tag("AutomationLane", {},
      tag("Lane", {}) +
      tag("Events", {},
        tag("AutomationEnvelope", {},
          tag("Pointer", { Value: 1 }) +
          tag("Envelope", {}) +
          tag("Events", {}, "\n" + pointsXml + "\n") +
          tag("EnvelopeOsc", {})
        )
      )
    );
  }).join("\n");

  return tag("AutomationEnvelopes", {}, "\n" + lanesXml + "\n");
}

function buildDeviceChainXml(track: Track): string {
  const effectsXml = (track.effects ?? []).map((fx) => {
    const paramsXml = Object.entries(fx.params).map(([k, v]) =>
      tag("FloatParameter", {},
        tag("Name", { Value: xmlEscape(k) }) +
        tag("Value", { Value: floatAttr(v) })
      )
    ).join("\n");
    return tag("Effect", {},
      tag("LomId", { Value: 0 }) +
      tag("LomIdView", { Value: 0 }) +
      tag("Id", { Value: fx.id }) +
      tag("Name", { Value: xmlEscape(fx.type) }) +
      tag("Bypass", { Value: fx.bypass }) +
      tag("Parameters", {}, "\n" + paramsXml + "\n") +
      tag("Preset", { PresetRef: 0 })
    );
  }).join("\n");

  const sendsXml = track.sends
    ? Object.entries(track.sends)
        .map(([name, value]) =>
          tag("Send", {},
            tag("Name", { Value: xmlEscape(name) }) +
            tag("Value", { Value: floatAttr(value) })
          )
        ).join("\n")
    : "";

  return tag("DeviceChain", {},
    tag("Mixer", {},
      tag("LomId", { Value: 0 }) +
      tag("LomIdView", { Value: 0 }) +
      tag("Volume", {},
        tag("LomId", { Value: 0 }) +
        tag("LomIdView", { Value: 0 }) +
        tag("Manual", { Value: floatAttr(track.volume) }) +
        tag("AutomationTarget", { Id: 0 })
      ) +
      tag("Pan", {},
        tag("LomId", { Value: 0 }) +
        tag("LomIdView", { Value: 0 }) +
        tag("Manual", { Value: floatAttr(track.pan) }) +
        tag("AutomationTarget", { Id: 0 })
      ) +
      tag("Mute", { Value: track.muted }) +
      tag("Solo", { Value: track.solo }) +
      (track.arm ? tag("Arm", { Value: true }) : "")
    ) +
    tag("Devices", {}, "\n" + effectsXml + "\n") +
    tag("Sends", {}, "\n" + sendsXml + "\n")
  );
}

function buildTrackXml(track: Track, clips: Record<ID, Clip>): string {
  const trackClips = track.clips
    .map((id) => clips[id])
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  const clipSlotsXml = trackClips.map((clip) => buildClipSlotXml(clip)).join("\n");

  const emptySlots = trackClips.length === 0
    ? tag("ClipSlot", {}, tag("ClipSlot::Clip", { Time: 0.0 },
        tag("ClipSlot::Clip::ClipTimeable", {},
          tag("SampleType", { Value: 0 }) +
          tag("CurrentStart", { Value: 0.0 }) +
          tag("CurrentEnd", { Value: 4.0 })
        )
      ))
    : "";

  const isMidi = track.type === "midi" || track.type === "group";
  const trackTag = isMidi ? "MidiTrack" : "AudioTrack";
  const preferredDevice = isMidi
    ? tag("PreferredDevice", { Value: "InstrumentImpulse" })
    : tag("PreferredDevice", { Value: "AudioToAudio" });

  return tag(trackTag, {},
    tag("LomId", { Value: 0 }) +
    tag("LomIdView", { Value: 0 }) +
    tag("Id", { Value: track.id }) +
    tag("Name", { Value: xmlEscape(track.name) }) +
    tag("Color", { Value: colorToAbleton(track.color) }) +
    tag("Annotation", { Value: "" }) +
    tag("PreferredDevice", {}) +
    tag("Freeze", { Value: 0 }) +
    tag("Muted", { Value: track.muted }) +
    tag("Solo", { Value: track.solo }) +
    tag("Arm", { Value: track.arm }) +
    tag("ClipSlotList", {},
      tag("ClipSlots", {}, "\n" + clipSlotsXml + emptySlots + "\n") +
      tag("ClipSlotsCount", { Value: Math.max(1, trackClips.length) })
    ) +
    buildDeviceChainXml(track) +
    buildAutomationEnvelopes(track) +
    tag("Sends", {}) +
    tag("GroupTrack", {}) +
    tag("ModulationSourceCount", { Value: 0 }) +
    tag("PlayingNotation", { Value: 0 }) +
    tag("SignedRefCount", { Value: 0 }) +
    tag("TimeSelectionStart", { Value: 0.0 }) +
    tag("TimeSelectionEnd", { Value: 64.0 }) +
    tag("PropertyList", {},
      tag("TransportOrder", { Value: 1 })
    ) +
    preferredDevice
  );
}

function buildMasterTrackXml(tracks: Track[]): string {
  const masterTrack = tracks.find((t) => t.type === "master");
  return tag("MasterTrack", {},
    tag("LomId", { Value: 0 }) +
    tag("LomIdView", { Value: 0 }) +
    tag("Name", { Value: "Master" }) +
    tag("Color", { Value: 100 }) +
    tag("DeviceChain", {},
      tag("Mixer", {},
        tag("Volume", {},
          tag("Manual", { Value: floatAttr(masterTrack?.volume ?? 0.8) })
        ) +
        tag("Pan", {},
          tag("Manual", { Value: floatAttr(masterTrack?.pan ?? 0) })
        )
      ) +
      tag("Devices", {}) +
      tag("Sends", {})
    ) +
    tag("AutomationEnvelopes", {})
  );
}

export function generateAlsXml(session: ExportSession): string {
  const tracksXml = session.tracks
    .filter((t) => t.type !== "master")
    .map((track) => buildTrackXml(track, session.clips))
    .join("\n");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    tag("Ableton", { MajorVersion: "5", MinorVersion: "12.0_12117", Creator: "Beehive Studio", Revision: "1" },
      tag("LiveSet", {},
        tag("LomId", { Value: 0 }) +
        tag("MasterAndCraterTrack", {},
          buildMasterTrackXml(session.tracks)
        ) +
        tag("Tracks", {}, "\n" + tracksXml + "\n") +
        tag("Locators", {}) +
        tag("AppointmentSettings", {}) +
        tag("MixerDevice", {}) +
        tag("GlobalQuantization", { Value: 7 }) +
        tag("Tempo", {},
          tag("Manual", { Value: floatAttr(session.bpm) }) +
          tag("AutomationTarget", { Id: 0 })
        ) +
        tag("Signature", {},
          tag("Numerator", { Value: session.timeSignature[0] }) +
          tag("Denominator", { Value: session.timeSignature[1] })
        ) +
        tag("Overdub", { Value: false }) +
        tag("ReWireMode", { Value: false }) +
        tag("LyncMode", { Value: false }) +
        tag("AudioInputLatency", { Value: 0.0 }) +
        tag("AudioOutputLatency", { Value: 0.0 }) +
        tag("EnforceDC", { Value: true }) +
        tag("Groove", {
          Name: "",
          BinType: 1,
          BinDescr: "",
          Grid: 0,
          Random: 0,
        })
      )
    )
  );
}

export async function exportAbletonLiveSet(
  session: ExportSession
): Promise<{ xml: string; sampleFiles: { src: string; destName: string }[] }> {
  const xml = generateAlsXml(session);
  const sampleFiles: { src: string; destName: string }[] = [];
  for (const clip of Object.values(session.clips)) {
    if (clip.audioFilePath && clip.type === "audio") {
      const fileName = clip.audioFilePath.split(/[/\\]/).pop() ?? `${clip.id}.wav`;
      sampleFiles.push({ src: clip.audioFilePath, destName: fileName });
    }
  }
  return { xml, sampleFiles };
}
