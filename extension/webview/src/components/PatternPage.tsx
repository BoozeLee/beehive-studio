import { useState, useCallback } from "react";
import {
  PatternEditor,
  type PatternStatePublic,
  type QaResult,
} from "./desktop/PatternEditor/PatternEditor";
import { PianoRoll } from "./desktop/PianoRoll/PianoRoll";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { usePatternStore } from "../stores/patternStore";
import { createChannel } from "../lib/audioMixer";

const COLORS = {
  textMuted: "#888",
};

interface MidiNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

const TRACK_COLORS = ["#ef4444", "#3b82f6", "#a855f7", "#10b981", "#f59e0b"];

export function PatternPage() {
  const project = useProjectStore((s) => s.project);
  const addClip = useProjectStore((s) => s.addClip);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const tracks = useProjectStore((s) => s.tracks);
  const { playing, currentBeat } = useTransportStore();
  const [pattern, setPattern] = useState<PatternStatePublic | undefined>();
  const [swing, setSwing] = useState(0);
  const [qa, setQa] = useState<QaResult | undefined>();
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [notes, setNotes] = useState<MidiNote[]>([]);
  const agentId = usePatternStore((s) => s.agentId);
  const brief = usePatternStore((s) => s.brief);

  const handleSendToTimeline = useCallback(
    (newNotes: MidiNote[], name: string, resultQa?: QaResult) => {
      if (!project) return;

      let targetTrack = tracks.find((t) => t.type === "drum");
      if (!targetTrack) {
        const id = crypto.randomUUID();
        targetTrack = {
          id,
          name: `Drums ${tracks.filter((t) => t.type === "drum").length + 1}`,
          type: "drum",
          color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          arm: false,
          clips: [],
          automationLanes: [],
        };
        addTrack(targetTrack);
        createChannel(targetTrack.id, targetTrack.name);
      }

      const id = crypto.randomUUID();
      const start = currentBeat;
      const duration = pattern?.stepCount
        ? pattern.stepCount * (pattern.resolution || 0.25)
        : 4;
      const clip = {
        id,
        name,
        type: "midi" as const,
        trackId: targetTrack.id,
        start,
        duration,
        loop: false,
        color: targetTrack.color,
        midiData: { notes: newNotes },
        metadata: {
          generative: true,
          agentId: agentId || "drums",
          promptText: brief,
          reasoningTrace: reasoning.slice(-3).join("\n"),
          confidence: resultQa?.score,
          tags: [agentId || "drums", "pattern"],
          qa: resultQa,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addClip(clip);
      updateTrack({ ...targetTrack, clips: [...targetTrack.clips, id] });
      setQa(resultQa);
    },
    [project, tracks, currentBeat, addClip, addTrack, updateTrack, pattern, agentId, brief, reasoning]
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 16,
        gap: 12,
        backgroundColor: "var(--vscode-editor-background)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Pattern Studio</h2>
      {!project ? (
        <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
          Open a project to edit patterns.
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PatternEditor
              isPlaying={playing}
              currentBeat={currentBeat}
              onPatternChange={setPattern}
              onSwingChange={setSwing}
              onMetadataChange={(q, r) => {
                setQa(q);
                setReasoning(r);
              }}
              onSendToTimeline={handleSendToTimeline}
              initialQa={qa}
              initialReasoning={reasoning}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PianoRoll
              notes={notes.map((n, i) => ({ ...n, id: `note-${i}` }))}
              onChange={(next) => setNotes(next.map(({ id, ...n }) => n))}
            />
          </div>
        </>
      )}
    </div>
  );
}
