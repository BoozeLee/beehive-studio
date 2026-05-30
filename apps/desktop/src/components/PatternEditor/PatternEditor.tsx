import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  active: "#4ade80",
  activeDim: "rgba(74,222,128,0.5)",
  inactive: "rgba(255,255,255,0.06)",
  hoverBg: "rgba(255,255,255,0.1)",
  playhead: "#ff8c42",
};

interface StepData {
  active: boolean;
  velocity: number;
}

interface PatternEditorProps {
  isPlaying: boolean;
  currentBeat: number;
  onPatternChange?: (pattern: PatternState) => void;
}

export interface PatternState {
  rows: string[];
  steps: Record<string, StepData[]>;
  stepCount: number;
  resolution: number;
}

const DEFAULT_ROWS = [
  { id: "kick", label: "Kick", color: "#ef4444" },
  { id: "snare", label: "Snare", color: "#fbbf24" },
  { id: "hihat-c", label: "HH Closed", color: "#60a5fa" },
  { id: "hihat-o", label: "HH Open", color: "#3b82f6" },
  { id: "clap", label: "Clap", color: "#a78bfa" },
  { id: "tom-h", label: "Tom High", color: "#34d399" },
  { id: "tom-m", label: "Tom Mid", color: "#10b981" },
  { id: "rim", label: "Rim", color: "#f472b6" },
];

export const PatternEditor: React.FC<PatternEditorProps> = ({
  isPlaying,
  currentBeat,
  onPatternChange,
}) => {
  const [stepCount, setStepCount] = useState(16);
  const [resolution] = useState(0.25);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"activate" | "deactivate">(
    "activate"
  );
  const gridRef = useRef<HTMLDivElement>(null);

  const [steps, setSteps] = useState<Record<string, StepData[]>>(() => {
    const initial: Record<string, StepData[]> = {};
    for (const row of DEFAULT_ROWS) {
      initial[row.id] = Array.from({ length: stepCount }, (_, i) => ({
        active: i % 4 === 0 && (row.id === "kick" || row.id === "hihat-c"),
        velocity: 100,
      }));
    }
    return initial;
  });

  const playheadStep = useMemo(() => {
    const beatsPerStep = resolution;
    if (beatsPerStep <= 0) return 0;
    return Math.floor(currentBeat / beatsPerStep) % stepCount;
  }, [currentBeat, resolution, stepCount]);

  const toggleStep = useCallback(
    (rowId: string, stepIdx: number, forceActive?: boolean) => {
      setSteps((prev) => {
        const row = prev[rowId];
        if (!row) return prev;
        const newRow = [...row];
        const newActive =
          forceActive !== undefined ? forceActive : !newRow[stepIdx].active;
        newRow[stepIdx] = {
          active: newActive,
          velocity: newActive ? newRow[stepIdx].velocity || 100 : 0,
        };
        return { ...prev, [rowId]: newRow };
      });
    },
    []
  );

  const handleMouseDown = useCallback(
    (rowId: string, stepIdx: number) => {
      const current = steps[rowId]?.[stepIdx];
      if (!current) return;
      const newMode = !current.active;
      setDragMode(newMode ? "activate" : "deactivate");
      setIsDragging(true);
      toggleStep(rowId, stepIdx, newMode);
    },
    [steps, toggleStep]
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

  useEffect(() => {
    if (onPatternChange) {
      onPatternChange({ rows: DEFAULT_ROWS.map((r) => r.id), steps, stepCount, resolution });
    }
  }, [steps, stepCount, resolution]);

  const clearPattern = useCallback(() => {
    setSteps((prev) => {
      const next: Record<string, StepData[]> = {};
      for (const [rowId, row] of Object.entries(prev)) {
        next[rowId] = row.map((s) => ({ ...s, active: false, velocity: 0 }));
      }
      return next;
    });
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
  }, []);

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        overflow: "hidden",
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
        }}
      >
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          Pattern Editor
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={clearPattern} style={toolBtnStyle}>
          Clear
        </button>
        <button onClick={randomizePattern} style={toolBtnStyle}>
          Random
        </button>
        <select
          value={stepCount}
          onChange={(e) => setStepCount(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={8}>8 steps</option>
          <option value={16}>16 steps</option>
          <option value={32}>32 steps</option>
        </select>
      </div>

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
                  i === playheadStep && isPlaying
                    ? COLORS.accent
                    : COLORS.textMuted,
                background:
                  i === playheadStep && isPlaying
                    ? "rgba(255,140,66,0.15)"
                    : "transparent",
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
              {(steps[row.id] || Array(stepCount).fill(null)).map(
                (step, stepIdx) => {
                  const isPlayheadStep =
                    stepIdx === playheadStep && isPlaying;
                  const isActive = step?.active ?? false;
                  return (
                    <div
                      key={stepIdx}
                      onMouseDown={() => handleMouseDown(row.id, stepIdx)}
                      onMouseEnter={() => handleMouseEnter(row.id, stepIdx)}
                      style={{
                        height: 28,
                        borderRadius: 4,
                        background: isActive
                          ? row.color
                          : isPlayheadStep
                          ? COLORS.playhead + "22"
                          : COLORS.inactive,
                        opacity: isActive ? 0.8 + (step?.velocity ?? 100) / 1270 : 0.5,
                        border: isPlayheadStep
                          ? `1px solid ${COLORS.playhead}`
                          : "1px solid transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-end",
                        transition: "background 0.1s",
                      }}
                    >
                      {isActive && (
                        <div
                          style={{
                            width: "100%",
                            height: `${(step?.velocity ?? 100) / 127 * 100}%`,
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: "0 0 3px 3px",
                          }}
                        />
                      )}
                    </div>
                  );
                }
              )}
            </React.Fragment>
          ))}
        </div>
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
