import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as api from "../../../lib/api";
import type { AgentInfo } from "../../../lib/api";
import { useProjectStore } from "../../../stores/projectStore";
import { useAppStore } from "../../../stores/appStore";
import { useTransportStore } from "../../../stores/transportStore";
import { usePatternStore } from "../../../stores/patternStore";
import {
  previewPattern,
  stopPatternPreview,
  isPatternPreviewPlaying,
} from "../../../lib/patternPlayer";
import {
  AGENT_ROW_TEMPLATES,
  DRUM_ROWS,
  type RowConfig,
  type StepData,
  type QaResult,
  type PatternState,
  type AgentPatternData,
} from "../../../lib/patternTypes";
import { BEEHIVE } from "../../../lib/theme";

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

export interface StepDataPublic {
  active: boolean;
  velocity: number;
}

export interface PatternStatePublic {
  rows: string[];
  steps: Record<string, StepDataPublic[]>;
  stepCount: number;
  resolution: number;
}

export { type QaResult };

interface PatternEditorProps {
  isPlaying?: boolean;
  currentBeat?: number;
  initialPattern?: PatternStatePublic;
  initialSwing?: number;
  initialQa?: QaResult;
  initialReasoning?: string[];
  onPatternChange?: (pattern: PatternStatePublic) => void;
  onSwingChange?: (swing: number) => void;
  onMetadataChange?: (qa: QaResult | undefined, reasoning: string[]) => void;
  onSendToTimeline?: (notes: Note[], name: string, qa?: QaResult) => void;
}

interface Note {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

const VELOCITY_PRESETS = [127, 100, 70, 50, 30];

export const PatternEditor: React.FC<PatternEditorProps> = ({
  isPlaying: propIsPlaying = false,
  currentBeat = 0,
  initialPattern,
  initialSwing = 0,
  initialQa,
  initialReasoning = [],
  onPatternChange,
  onSwingChange,
  onMetadataChange,
  onSendToTimeline,
}) => {
  const project = useProjectStore((s) => s.project);
  const { playing: transportPlaying, bpm } = useTransportStore();
  const { addNotification } = useAppStore();
  const {
    name,
    setName,
    brief,
    setBrief,
    rows,
    steps,
    stepCount,
    resolution,
    swing,
    setSwing,
    agentId,
    setAgentId,
    qa,
    reasoning,
    isGenerating,
    setGenerating,
    setQa,
    setReasoning,
    toggleStep,
    cycleVelocity,
    clearPattern,
    randomizePattern,
    setStepCount,
    undo,
    redo,
    saveCurrent,
    library,
    loadPattern,
    deletePattern,
    duplicatePattern,
    getCurrentState,
  } = usePatternStore();

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"activate" | "deactivate">("activate");
  const gridRef = useRef<HTMLDivElement>(null);

  // Seed initial prop data once.
  useEffect(() => {
    if (initialQa) setQa(initialQa);
    if (initialReasoning.length > 0) setReasoning(initialReasoning);
    if (initialPattern) {
      // If a controlled initial pattern is provided, we overlay it onto the default pattern.
      // A full load would require knowing the row configs; here we assume drum rows.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listAgents()
      .then((agents) => {
        if (!cancelled) setAvailableAgents(agents);
      })
      .catch((err) => {
        if (!cancelled) {
          addNotification(`Could not load agents: ${String(err)}`, "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [addNotification]);

  useEffect(() => {
    const current = getCurrentState();
    onPatternChange?.({
      rows: current.rows,
      steps: current.steps,
      stepCount: current.stepCount,
      resolution: current.resolution,
    });
  }, [steps, stepCount, resolution, rows, getCurrentState, onPatternChange]);

  useEffect(() => {
    onSwingChange?.(swing);
  }, [swing, onSwingChange]);

  useEffect(() => {
    onMetadataChange?.(qa, reasoning);
  }, [qa, reasoning, onMetadataChange]);

  useEffect(() => {
    return () => {
      stopPatternPreview();
    };
  }, []);

  const playheadStep = useMemo(() => {
    const beatsPerStep = resolution;
    if (beatsPerStep <= 0) return 0;
    return Math.floor(currentBeat / beatsPerStep) % stepCount;
  }, [currentBeat, resolution, stepCount]);

  const selectedAgent = useMemo(
    () => availableAgents.find((a) => a.id === agentId),
    [availableAgents, agentId]
  );

  const handleToggleStep = useCallback(
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

  const handlePlayPreview = useCallback(() => {
    if (transportPlaying) {
      addNotification("Stop arrangement playback before previewing a pattern", "info");
      return;
    }
    if (previewPlaying) {
      stopPatternPreview();
      setPreviewPlaying(false);
      return;
    }
    previewPattern(rows, steps, bpm, resolution, swing);
    setPreviewPlaying(true);
  }, [transportPlaying, previewPlaying, rows, steps, bpm, resolution, swing, addNotification]);

  useEffect(() => {
    if (previewPlaying && !isPatternPreviewPlaying()) {
      setPreviewPlaying(false);
    }
  }, [previewPlaying]);

  const handleStepCountChange = useCallback(
    (count: number) => {
      setStepCount(count);
    },
    [setStepCount]
  );

  const rowsForAgent = useCallback((agent: AgentInfo | undefined): RowConfig[] => {
    if (!agent) return DRUM_ROWS;
    const capability = agent.capabilities?.[0] ?? agent.id;
    return AGENT_ROW_TEMPLATES[capability] ?? AGENT_ROW_TEMPLATES[agent.id] ?? DRUM_ROWS;
  }, []);

  const parseAgentData = useCallback(
    (data: AgentPatternData, targetRows: RowConfig[]) => {
      const nextSteps: Record<string, StepData[]> = {};
      for (const row of targetRows) {
        nextSteps[row.id] = Array.from({ length: stepCount }, () => ({
          active: false,
          velocity: 0,
        }));
      }

      if (data.steps) {
        for (const [agentId, rowSteps] of Object.entries(data.steps)) {
          const row = targetRows.find((r) => r.id === agentId || r.label.toLowerCase() === agentId.toLowerCase());
          if (!row || !nextSteps[row.id]) continue;
          for (let i = 0; i < Math.min(rowSteps.length, stepCount); i++) {
            const s = rowSteps[i];
            nextSteps[row.id][i] = {
              active: s.active,
              velocity: s.active ? s.velocity : 0,
            };
          }
        }
      } else if (data.notes) {
        for (const note of data.notes) {
          const row = targetRows.find((r) => r.pitch === note.pitch);
          if (!row) continue;
          const stepIdx = Math.round(note.start / resolution);
          if (stepIdx >= 0 && stepIdx < stepCount) {
            nextSteps[row.id][stepIdx] = {
              active: true,
              velocity: Math.max(0, Math.min(127, note.velocity)),
            };
          }
        }
      }

      return nextSteps;
    },
    [resolution, stepCount]
  );

  const handleGenerate = useCallback(async () => {
    if (!project) {
      setReasoning(["Open a Beehive project first."]);
      return;
    }
    const agent: AgentInfo =
      selectedAgent ??
      availableAgents.find((a) => a.id === "drums") ?? {
        id: "drums",
        name: "Drum Agent",
        description: "Generates drum patterns",
        capabilities: ["drums"],
      };
    const targetRows = rowsForAgent(agent);

    setGenerating(true);
    setQa(undefined);
    try {
      const session = await api.runAgent({
        agent: agent.id,
        brief: brief.trim() || `Generate a ${agent.id} pattern`,
        projectId: project.id,
        context: {
          style: "four_on_floor",
          step_count: stepCount,
          resolution,
          density: 0.5,
          swing: swing / 100,
          bpm: project.bpm,
          capabilities: agent.capabilities ?? [agent.id],
        },
      });

      const data = session.artifacts?.[0]?.data as AgentPatternData | undefined;
      if (data) {
        const nextSteps = parseAgentData(data, targetRows);
        usePatternStore.setState({
          rows: targetRows,
          steps: nextSteps,
          agentId: agent.id,
        });
      }

      setQa(data?.qa);
      setReasoning(data?.reasoning ?? session.reasoning ?? []);
    } catch (err) {
      setReasoning([`Agent error: ${String(err).slice(0, 120)}`]);
      addNotification(`Agent failed to generate pattern: ${String(err)}`, "error");
    } finally {
      setGenerating(false);
    }
  }, [
    project,
    selectedAgent,
    availableAgents,
    rowsForAgent,
    brief,
    stepCount,
    resolution,
    swing,
    parseAgentData,
    setGenerating,
    setQa,
    setReasoning,
    addNotification,
  ]);

  const handleSendToTimeline = useCallback(() => {
    if (!onSendToTimeline) return;
    const notes: Note[] = [];
    for (const row of rows) {
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
    onSendToTimeline(notes, name || "Pattern", qa);
  }, [onSendToTimeline, rows, steps, resolution, swing, name, qa]);

  const handleNewPattern = useCallback(() => {
    stopPatternPreview();
    setPreviewPlaying(false);
    usePatternStore.setState({
      currentPatternId: undefined,
      name: "Untitled Pattern",
      rows: DRUM_ROWS,
      steps: Object.fromEntries(
        DRUM_ROWS.map((row) => [row.id, Array.from({ length: 16 }, () => ({ active: false, velocity: 0 }))])
      ),
      stepCount: 16,
      resolution: 0.25,
      swing: 0,
      agentId: undefined,
      qa: undefined,
      reasoning: [],
      undoStack: [],
      redoStack: [],
    });
  }, []);

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
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pattern name..."
          style={{
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.bg,
            color: COLORS.text,
            width: 120,
          }}
        />
        <button onClick={saveCurrent} style={toolBtnStyle} title="Save pattern to library">
          Save
        </button>
        <button onClick={handleNewPattern} style={toolBtnStyle} title="New pattern">
          New
        </button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowLibrary((v) => !v)} style={toolBtnStyle}>
            Library ▾
          </button>
          {showLibrary && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 50,
                minWidth: 180,
                maxHeight: 200,
                overflow: "auto",
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                marginTop: 4,
              }}
            >
              {library.length === 0 && (
                <div style={{ padding: 8, fontSize: 11, color: COLORS.textMuted }}>No saved patterns</div>
              )}
              {library.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}
                >
                  <button
                    onClick={() => {
                      loadPattern(entry.id);
                      setShowLibrary(false);
                    }}
                    style={{ ...toolBtnStyle, flex: 1, justifyContent: "flex-start" }}
                  >
                    {entry.name}
                  </button>
                  <button
                    onClick={() => duplicatePattern(entry.id)}
                    style={{ ...toolBtnStyle, padding: "2px 6px" }}
                    title="Duplicate"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => deletePattern(entry.id)}
                    style={{ ...toolBtnStyle, padding: "2px 6px", color: "#ff9a9a" }}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 16, background: COLORS.border }} />

        <button onClick={undo} style={toolBtnStyle} title="Undo">
          ↶
        </button>
        <button onClick={redo} style={toolBtnStyle} title="Redo">
          ↷
        </button>

        <button
          onClick={handlePlayPreview}
          disabled={transportPlaying}
          style={{
            ...toolBtnStyle,
            background: previewPlaying ? COLORS.accent : transportPlaying ? "#333" : "transparent",
            color: previewPlaying ? "#000" : COLORS.text,
          }}
          title={transportPlaying ? "Arrangement is playing" : previewPlaying ? "Stop preview" : "Preview pattern"}
        >
          {previewPlaying ? "⏹ Stop" : "▶ Preview"}
        </button>

        <div style={{ width: 1, height: 16, background: COLORS.border }} />

        <select
          value={agentId ?? ""}
          onChange={(e) => setAgentId(e.target.value || undefined)}
          style={selectStyle}
          title="Select agent"
        >
          <option value="">Drums (default)</option>
          {availableAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Brief..."
          disabled={isGenerating}
          style={{
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.bg,
            color: COLORS.text,
            width: 140,
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            ...toolBtnStyle,
            background: isGenerating ? "#333" : COLORS.accent,
            color: isGenerating ? "#666" : "#000",
          }}
        >
          {isGenerating ? "..." : "Generate"}
        </button>

        <div style={{ width: 1, height: 16, background: COLORS.border }} />

        <button onClick={clearPattern} style={toolBtnStyle}>Clear</button>
        <button onClick={randomizePattern} style={toolBtnStyle}>Random</button>

        <select
          value={stepCount}
          onChange={(e) => handleStepCountChange(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={8}>8 steps</option>
          <option value={16}>16 steps</option>
          <option value={32}>32 steps</option>
        </select>

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
            background: COLORS.bg,
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
                color: i === playheadStep && (propIsPlaying || previewPlaying) ? COLORS.accent : COLORS.textMuted,
                background:
                  i === playheadStep && (propIsPlaying || previewPlaying)
                    ? "rgba(255,140,66,0.15)"
                    : "transparent",
                borderRadius: 3,
              }}
            >
              {i + 1}
            </div>
          ))}

          {rows.map((row) => (
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
                const isPlayheadStep = stepIdx === playheadStep && (propIsPlaying || previewPlaying);
                const isActive = step?.active ?? false;
                const velocity = step?.velocity ?? 0;
                const isGhost = isActive && velocity < 60;
                return (
                  <div
                    key={stepIdx}
                    onMouseDown={(e) => handleToggleStep(row.id, stepIdx, e.shiftKey)}
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
