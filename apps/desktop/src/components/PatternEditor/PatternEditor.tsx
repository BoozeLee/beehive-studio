/**
 * PatternEditor — Step sequencer with drum agent integration
 *
 * Features:
 * - Generate patterns from briefs via Drum Agent
 * - Step toggle, velocity editing (shift+click), ghost hit visualization
 * - Swing control, playhead, send to timeline
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BEEHIVE } from "../../lib/theme";

const COLORS = {
  bg: BEEHIVE.bg,
  panel: BEEHIVE.panel,
  border: BEEHIVE.border,
  accent: BEEHIVE.comb,
  text: BEEHIVE.text,
  textMuted: BEEHIVE.textMuted,
  active: BEEHIVE.success,
  activeDim: "rgba(74,222,128,0.5)",
  inactive: "rgba(255,255,255,0.06)",
  hoverBg: "rgba(255,255,255,0.1)",
  playhead: BEEHIVE.comb,
  warning: BEEHIVE.warning,
};

interface StepData {
  active: boolean;
  velocity: number;
}

interface Note {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

interface QaResult {
  pass: boolean;
  score: number;
  warnings: string[];
}

interface DrumAgentResponse {
  task_id?: string;
  status?: string;
  reasoning?: string[];
  steps?: Record<string, { active: boolean; velocity: number }[]>;
  style?: string;
  step_count?: number;
  qa?: QaResult;
}

export interface PatternState {
  rows: string[];
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
}

interface PatternEditorProps {
  isPlaying: boolean;
  currentBeat: number;
  onPatternChange?: (pattern: PatternState) => void;
  onSendToTimeline?: (notes: Note[], name: string, qa?: QaResult) => void;
}

const DEFAULT_ROWS = [
  { id: "kick", label: "Kick", color: "#ef4444", pitch: 36 },
  { id: "snare", label: "Snare", color: "#fbbf24", pitch: 38 },
  { id: "hihat-c", label: "HH Closed", color: "#60a5fa", pitch: 42 },
  { id: "hihat-o", label: "HH Open", color: "#3b82f6", pitch: 46 },
  { id: "clap", label: "Clap", color: "#a78bfa", pitch: 39 },
  { id: "tom-h", label: "Tom High", color: "#34d399", pitch: 50 },
  { id: "tom-m", label: "Tom Mid", color: "#10b981", pitch: 47 },
  { id: "rim", label: "Rim", color: "#f472b6", pitch: 37 },
];

const VELOCITY_PRESETS = [127, 100, 70, 50, 30];

// Map agent sound IDs (with underscores) to editor row IDs (with hyphens)
const AGENT_TO_EDITOR_ID: Record<string, string> = {
  kick: "kick",
  snare: "snare",
  hihat_c: "hihat-c",
  hihat_o: "hihat-o",
  clap: "clap",
  tom_h: "tom-h",
  tom_m: "tom-m",
  rim: "rim",
};

export const PatternEditor: React.FC<PatternEditorProps> = ({
  isPlaying,
  currentBeat,
  onPatternChange,
  onSendToTimeline,
}) => {
  const [stepCount, setStepCount] = useState(16);
  const [resolution] = useState(0.25);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"activate" | "deactivate">("activate");
  const [steps, setSteps] = useState<Record<string, StepData[]>>(() => {
    const initial: Record<string, StepData[]> = {};
    for (const row of DEFAULT_ROWS) {
      initial[row.id] = Array.from({ length: 16 }, (_, i) => ({
        active: i % 4 === 0 && (row.id === "kick" || row.id === "hihat-c"),
        velocity: 100,
      }));
    }
    return initial;
  });
  const [swing, setSwing] = useState(0);
  const [brief, setBrief] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [qa, setQa] = useState<QaResult | undefined>();
  const [reasoning, setReasoning] = useState<string[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  const playheadStep = useMemo(() => {
    const beatsPerStep = resolution;
    if (beatsPerStep <= 0) return 0;
    return Math.floor(currentBeat / beatsPerStep) % stepCount;
  }, [currentBeat, resolution, stepCount]);

  useEffect(() => {
    if (onPatternChange) {
      onPatternChange({ rows: DEFAULT_ROWS.map((r) => r.id), steps, stepCount, resolution });
    }
  }, [steps, stepCount, resolution, onPatternChange]);

  const toggleStep = useCallback(
    (rowId: string, stepIdx: number, forceActive?: boolean, newVelocity?: number) => {
      setSteps((prev) => {
        const row = prev[rowId];
        if (!row) return prev;
        const newRow = [...row];
        const newActive = forceActive !== undefined ? forceActive : !newRow[stepIdx].active;
        newRow[stepIdx] = {
          active: newActive,
          velocity: newActive ? (newVelocity ?? (newRow[stepIdx].velocity || 100)) : 0,
        };
        return { ...prev, [rowId]: newRow };
      });
    },
    []
  );

  const cycleVelocity = useCallback((rowId: string, stepIdx: number) => {
    setSteps((prev) => {
      const row = prev[rowId];
      if (!row || !row[stepIdx].active) return prev;
      const newRow = [...row];
      const currentVel = newRow[stepIdx].velocity;
      const nextVel = VELOCITY_PRESETS.find((v) => v < currentVel) ?? VELOCITY_PRESETS[0];
      newRow[stepIdx] = { ...newRow[stepIdx], velocity: nextVel };
      return { ...prev, [rowId]: newRow };
    });
  }, []);

  const handleMouseDown = useCallback(
    (rowId: string, stepIdx: number, shiftKey: boolean) => {
      if (shiftKey) {
        cycleVelocity(rowId, stepIdx);
        return;
      }
      const current = steps[rowId]?.[stepIdx];
      if (!current) return;
      const newMode = !current.active;
      setDragMode(newMode ? "activate" : "deactivate");
      setIsDragging(true);
      toggleStep(rowId, stepIdx, newMode);
    },
    [steps, toggleStep, cycleVelocity]
  );

  const handleMouseEnter = useCallback(
    (rowId: string, stepIdx: number) => {
      if (!isDragging) return;
      toggleStep(rowId, stepIdx, dragMode === "activate");
    },
    [isDragging, dragMode, toggleStep]
  );

  useEffect(() => {
    const handleGlobalUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, []);

  const clearPattern = useCallback(() => {
    setSteps((prev) => {
      const next: Record<string, StepData[]> = {};
      for (const [rowId, row] of Object.entries(prev)) {
        next[rowId] = row.map((s) => ({ ...s, active: false, velocity: 0 }));
      }
      return next;
    });
    setQa(undefined);
    setReasoning([]);
  }, []);

  const randomizePattern = useCallback(() => {
    setSteps((prev) => {
      const next: Record<string, StepData[]> = {};
      for (const [rowId, row] of Object.entries(prev)) {
        next[rowId] = row.map(() => {
          const active = Math.random() > 0.6;
          return {
            active,
            velocity: active ? 60 + Math.floor(Math.random() * 60) : 0,
          };
        });
      }
      return next;
    });
    setQa(undefined);
  }, []);

  const generateFromAgent = useCallback(async () => {
    setIsGenerating(true);
    setQa(undefined);
    try {
      const data = await invoke<DrumAgentResponse>("send_agent_request", {
        endpoint: "agents/drums",
        body: {
          brief: brief.trim() || "Generate a drum pattern",
          style: "four_on_floor",
          step_count: stepCount,
          density: 0.5,
          swing: swing / 100,
          session_context: { bpm: 142 },
        },
      });

      if (data.steps) {
        const newSteps: Record<string, StepData[]> = {};
        for (const row of DEFAULT_ROWS) {
          newSteps[row.id] = Array.from({ length: stepCount }, () => ({
            active: false,
            velocity: 0,
          }));
        }

        for (const [agentId, rowSteps] of Object.entries(data.steps)) {
          const editorId = AGENT_TO_EDITOR_ID[agentId];
          if (!editorId || !newSteps[editorId]) continue;
          for (let i = 0; i < Math.min(rowSteps.length, stepCount); i++) {
            const s = rowSteps[i];
            newSteps[editorId][i] = {
              active: s.active,
              velocity: s.active ? s.velocity : 0,
            };
          }
        }
        setSteps(newSteps);
      }

      setQa(data.qa);
      setReasoning(data.reasoning ?? []);
    } catch (err) {
      setReasoning([`Drum agent error: ${String(err).slice(0, 120)}`]);
    } finally {
      setIsGenerating(false);
    }
  }, [brief, stepCount, swing]);

  const handleSendToTimeline = useCallback(() => {
    if (!onSendToTimeline) return;
    const notes: Note[] = [];
    for (const row of DEFAULT_ROWS) {
      const rowSteps = steps[row.id];
      if (!rowSteps) continue;
      for (let i = 0; i < rowSteps.length; i++) {
        const step = rowSteps[i];
        if (!step.active) continue;
        const baseStart = i * resolution;
        const isOffbeat = i % 2 === 1;
        const swingOffset = isOffbeat ? (swing / 100) * resolution * 0.5 : 0;
        notes.push({
          pitch: row.pitch,
          velocity: step.velocity,
          start: baseStart + swingOffset,
          duration: resolution * 0.8,
        });
      }
    }
    onSendToTimeline(notes, "Drum Pattern", qa);
  }, [steps, resolution, swing, onSendToTimeline, qa]);

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Pattern Editor</span>
        <div style={{ flex: 1 }} />

        <input
          type="text"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Drum brief..."
          disabled={isGenerating}
          style={{
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.bg,
            color: COLORS.text,
            width: 160,
          }}
        />
        <button
          onClick={generateFromAgent}
          disabled={isGenerating}
          style={{
            ...toolBtnStyle,
            background: isGenerating ? "#333" : COLORS.accent,
            color: isGenerating ? "#666" : "#000",
            opacity: isGenerating ? 0.6 : 1,
          }}
        >
          {isGenerating ? "..." : "Generate"}
        </button>

        <div style={{ width: 1, height: 16, background: COLORS.border }} />

        <button onClick={clearPattern} style={toolBtnStyle}>Clear</button>
        <button onClick={randomizePattern} style={toolBtnStyle}>Random</button>

        <select
          value={stepCount}
          onChange={(e) => setStepCount(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={8}>8 steps</option>
          <option value={16}>16 steps</option>
          <option value={32}>32 steps</option>
        </select>

        <div style={{ width: 1, height: 16, background: COLORS.border }} />

        <label style={{ fontSize: 10, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
          Swing
          <input
            type="range"
            min={0}
            max={100}
            value={swing}
            onChange={(e) => setSwing(Number(e.target.value))}
            style={{ width: 60 }}
          />
          <span style={{ minWidth: 28 }}>{swing}%</span>
        </label>

        {onSendToTimeline && (
          <>
            <div style={{ width: 1, height: 16, background: COLORS.border }} />
            <button
              onClick={handleSendToTimeline}
              style={{
                ...toolBtnStyle,
                background: BEEHIVE.honey,
                color: "#000",
              }}
            >
              → Timeline
            </button>
          </>
        )}
      </div>

      {/* QA & Reasoning */}
      {(qa || reasoning.length > 0) && (
        <div
          style={{
            padding: "6px 10px",
            borderBottom: `1px solid ${COLORS.border}`,
            background: `${COLORS.bg}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {qa && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: qa.pass ? `${COLORS.active}22` : `${COLORS.warning}22`,
                  color: qa.pass ? COLORS.active : COLORS.warning,
                }}
              >
                QA: {qa.score.toFixed(0)}/100
              </span>
              {qa.warnings.slice(0, 2).map((w, i) => (
                <span key={i} style={{ fontSize: 10, color: COLORS.warning }}>
                  {w}
                </span>
              ))}
            </div>
          )}
          {reasoning.length > 0 && (
            <div style={{ fontSize: 10, color: COLORS.textMuted }}>
              {reasoning.slice(-1)[0]}
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div
        ref={gridRef}
        style={{
          padding: 8,
          overflowX: "auto",
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `80px repeat(${stepCount}, minmax(24px, 1fr))`,
            gap: 2,
            minWidth: 80 + stepCount * 26,
          }}
        >
          {/* Header */}
          <div style={{ height: 20 }} />
          {Array.from({ length: stepCount }, (_, i) => (
            <div
              key={i}
              style={{
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color:
                  i === playheadStep && isPlaying ? COLORS.accent : COLORS.textMuted,
                background:
                  i === playheadStep && isPlaying ? "rgba(255,140,66,0.15)" : "transparent",
                borderRadius: 3,
              }}
            >
              {i + 1}
            </div>
          ))}

          {/* Rows */}
          {DEFAULT_ROWS.map((row) => (
            <React.Fragment key={row.id}>
              <div
                style={{
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "0 4px",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: row.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: COLORS.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.label}
                </span>
              </div>
              {(steps[row.id] || Array(stepCount).fill(null)).map((step, stepIdx) => {
                const isPlayheadStep = stepIdx === playheadStep && isPlaying;
                const isActive = step?.active ?? false;
                const velocity = step?.velocity ?? 0;
                const isGhost = isActive && velocity < 60;
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={(e) => handleMouseDown(row.id, stepIdx, e.shiftKey)}
                    onMouseEnter={() => handleMouseEnter(row.id, stepIdx)}
                    title={isActive ? `${row.label} step ${stepIdx + 1} (vel ${velocity})` : `${row.label} step ${stepIdx + 1}`}
                    style={{
                      height: 28,
                      borderRadius: 4,
                      background: isActive ? row.color : isPlayheadStep ? COLORS.playhead + "22" : COLORS.inactive,
                      opacity: isGhost ? 0.45 : isActive ? 0.85 : 0.5,
                      border: isPlayheadStep ? `1px solid ${COLORS.playhead}` : "1px solid transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-end",
                      transition: "background 0.1s",
                      position: "relative",
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          width: "100%",
                          height: `${Math.max((velocity / 127) * 100, 15)}%`,
                          background: "rgba(0,0,0,0.25)",
                          borderRadius: "0 0 3px 3px",
                        }}
                      />
                    )}
                    {/* Ghost hit indicator dot */}
                    {isGhost && (
                      <div
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#fff",
                          opacity: 0.6,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div
        style={{
          padding: "4px 10px",
          fontSize: 10,
          color: COLORS.textMuted,
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        Click to toggle • Shift+click active step to cycle velocity • Drag to paint
      </div>
    </div>
  );
};

const toolBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: 11,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  background: COLORS.panel,
  color: COLORS.text,
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  padding: "3px 6px",
  fontSize: 11,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  background: COLORS.bg,
  color: COLORS.text,
};
