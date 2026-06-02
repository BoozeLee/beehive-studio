import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReasoningTrace, type ReasoningStep } from "./ReasoningTrace";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

interface Clip {
  id: string;
  name: string;
  duration?: number;
  color?: string;
  midiData?: {
    notes: Array<{
      pitch: number;
      velocity: number;
      start: number;
      duration: number;
    }>;
  };
}

interface OrchestrationPanelProps {
  brief: string;
  clips: Clip[];
  bpm: number;
  onStatus: (status: string) => void;
  onClipGenerated: (clip: Clip) => void;
  reasoningHook: {
    steps: ReasoningStep[];
    addStep: (step: ReasoningStep) => void;
    appendReasoning: (text: string) => void;
    complete: () => void;
    clear: () => void;
  };
}

const AGENTS = [
  { id: "rhythm_groove", name: "Rhythm", icon: "◆", description: "Basslines & groove patterns" },
  { id: "drums", name: "Drums", icon: "🥁", description: "Kick, snare, hats, percussion" },
  { id: "harmony", name: "Harmony", icon: "🎹", description: "Chord progressions & pads" },
  { id: "melody", name: "Melody", icon: "🎵", description: "Leads, motifs, themes" },
  { id: "arrangement", name: "Arrange", icon: "🎼", description: "Song structure & sections" },
  { id: "sound_design", name: "Sound", icon: "🎛", description: "Synth patches: bass, lead, pad" },
  { id: "mastering", name: "Master", icon: "🔊", description: "Loudness & tonal balance" },
  { id: "sample_curator", name: "Samples", icon: "📂", description: "Analyze & generate one-shots" },
];

export const OrchestrationPanel: React.FC<OrchestrationPanelProps> = ({
  brief,
  clips,
  bpm,
  onStatus,
  onClipGenerated,
  reasoningHook,
}) => {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["rhythm_groove", "drums"]);
  const [isRunning, setIsRunning] = useState(false);
  const [chainMode, setChainMode] = useState(true);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((a) => a !== agentId);
      }
      return [...prev, agentId];
    });
  }, []);

  const runOrchestration = useCallback(async () => {
    if (selectedAgents.length === 0) {
      onStatus("Select at least one agent");
      return;
    }

    const text = brief.trim() || "Generate a rhythm pattern";
    setIsRunning(true);
    reasoningHook.clear();

    reasoningHook.addStep({ type: "status", text: "Starting orchestration..." });
    reasoningHook.addStep({ type: "reasoning", text: `Selected agents: ${selectedAgents.join(", ")}` });

    if (chainMode) {
      reasoningHook.addStep({ type: "reasoning", text: "Chain mode: outputs will flow between agents" });
    }

    try {
      const data = await invoke<{
        task_id: string;
        status: string;
        agents_invoked: string[];
        reasoning: string[];
        errors: string[];
      }>("orchestrate_agents", {
        brief: text,
        agents: selectedAgents,
        chainMode,
        sessionContext: {
          bpm,
          swing: 0.68,
          session_id: "demo-session-1",
        },
      });

      if (data.reasoning) {
        for (const r of data.reasoning) {
          reasoningHook.appendReasoning(r);
        }
      }

      if (data.errors && data.errors.length > 0) {
        for (const err of data.errors) {
          reasoningHook.addStep({ type: "error", text: err });
        }
      }

      reasoningHook.addStep({
        type: "complete",
        text: `Orchestration complete: ${data.agents_invoked?.join(", ") || "no agents"}`,
      });

      onClipGenerated({
        id: data.task_id || crypto.randomUUID(),
        name: `Orchestrated: ${text.slice(0, 30)}...`,
        duration: 4,
        color: "#4a3a2a",
        midiData: { notes: [] },
      });

      onStatus(`Orchestrated: ${data.agents_invoked?.length || 0} agents`);
    } catch (err) {
      console.error(err);
      reasoningHook.addStep({ type: "error", text: `Orchestration failed: ${String(err)}` });
      onStatus("Orchestration failed — check backend");
    } finally {
      setIsRunning(false);
      reasoningHook.complete();
    }
  }, [brief, selectedAgents, chainMode, bpm, onStatus, onClipGenerated, reasoningHook]);

  const runStyleReference = useCallback(async () => {
    if (clips.length === 0) {
      onStatus("Generate clips first to analyze style");
      return;
    }

    setIsRunning(true);
    reasoningHook.clear();
    reasoningHook.addStep({ type: "status", text: "Analyzing style..." });

    const latestClip = clips[clips.length - 1];
    const midiData = latestClip.midiData || { notes: [] };

    try {
      const data = await invoke<{
        id: string;
        status: string;
        reasoning: string[];
        style_profile: {
          bpm: number;
          key: string;
          mode: string;
          genres: string[];
        };
      }>("run_style_agent", {
        midiData,
        sessionContext: { bpm },
      });

      if (data.reasoning) {
        for (const r of data.reasoning) {
          reasoningHook.appendReasoning(r);
        }
      }

      if (data.style_profile) {
        reasoningHook.addStep({
          type: "reasoning",
          text: `Detected: ${data.style_profile.bpm} BPM, ${data.style_profile.key} ${data.style_profile.mode}`,
        });
        reasoningHook.addStep({
          type: "reasoning",
          text: `Genres: ${data.style_profile.genres?.join(", ") || "unknown"}`,
        });
      }

      reasoningHook.addStep({ type: "complete", text: "Style analysis complete" });
      onStatus(`Style: ${data.style_profile?.bpm || bpm} BPM, ${data.style_profile?.key || "C"} ${data.style_profile?.mode || "minor"}`);
    } catch (err) {
      console.error(err);
      reasoningHook.addStep({ type: "error", text: `Style analysis failed: ${String(err)}` });
      onStatus("Style analysis failed");
    } finally {
      setIsRunning(false);
      reasoningHook.complete();
    }
  }, [clips, bpm, onStatus, reasoningHook]);

  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>
          Multi-Agent Orchestration
        </span>
      </div>

      {/* Agent Selection */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, display: "block" }}>
          Select agents to chain:
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                border: `1px solid ${selectedAgents.includes(agent.id) ? COLORS.accent : COLORS.border}`,
                borderRadius: 4,
                background: selectedAgents.includes(agent.id) ? "rgba(255,140,66,0.2)" : "transparent",
                color: selectedAgents.includes(agent.id) ? COLORS.accent : COLORS.text,
                cursor: "pointer",
              }}
            >
              {agent.icon} {agent.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chain Mode Toggle */}
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={chainMode}
            onChange={(e) => setChainMode(e.target.checked)}
            style={{ accentColor: COLORS.accent }}
          />
          <span style={{ fontSize: 11, color: COLORS.text }}>
            Chain mode (pass output to next agent)
          </span>
        </label>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={runOrchestration}
          disabled={isRunning || selectedAgents.length === 0}
          style={{
            flex: 1,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 4,
            background: isRunning || selectedAgents.length === 0 ? "#333" : COLORS.accent,
            color: isRunning || selectedAgents.length === 0 ? "#666" : "#000",
            cursor: isRunning || selectedAgents.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? "Orchestrating..." : "Run Orchestration"}
        </button>
        <button
          onClick={runStyleReference}
          disabled={isRunning}
          style={{
            padding: "8px 12px",
            fontSize: 11,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: "transparent",
            color: COLORS.text,
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          Style Analysis
        </button>
      </div>

      {/* Reasoning Trace */}
      {reasoningHook.steps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <ReasoningTrace steps={reasoningHook.steps} title="Orchestration" maxHeight={150} />
        </div>
      )}
    </div>
  );
};