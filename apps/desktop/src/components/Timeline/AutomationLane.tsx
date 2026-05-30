import React, { useRef, useEffect, useCallback } from "react";
import {
  type AutomationLane,
  interpolateAutomation,
  PARAM_RANGES,
} from "../../lib/automationEngine";

const COLORS = {
  bg: "#0f0f12",
  border: "#2a2a30",
  accent: "#ff8c42",
  textMuted: "#888",
  laneBg: "#141418",
};

interface AutomationLaneViewProps {
  lane: AutomationLane;
  totalBeats: number;
  zoom: number;
  isPlaying: boolean;
  currentBeat: number;
  onAddPoint: (time: number, value: number) => void;
  onRemovePoint: (time: number) => void;
}

export const AutomationLaneView: React.FC<AutomationLaneViewProps> = ({
  lane,
  totalBeats,
  zoom,
  isPlaying,
  currentBeat,
  onAddPoint,
  onRemovePoint,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const range = PARAM_RANGES[lane.parameter] ?? {
    min: 0,
    max: 1,
    default: 0.5,
    unit: "",
  };

  const width = totalBeats * zoom;
  const height = 40;

  const drawLane = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = COLORS.laneBg;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let beat = 0; beat <= totalBeats; beat += 4) {
      const x = beat * zoom;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Automation curve
    if (lane.points.length > 1) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const beat = x / zoom;
        const value = interpolateAutomation(lane.points, beat);
        const normalizedValue =
          range.max === range.min
            ? 0.5
            : (value - range.min) / (range.max - range.min);
        const y = height - normalizedValue * height;

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Points
    for (const point of lane.points) {
      const x = point.time * zoom;
      const normalizedValue =
        range.max === range.min
          ? 0.5
          : (point.value - range.min) / (range.max - range.min);
      const y = height - normalizedValue * height;

      ctx.fillStyle = COLORS.accent;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Playhead
    if (isPlaying) {
      const px = currentBeat * zoom;
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [lane, totalBeats, zoom, range, isPlaying, currentBeat, width, height]);

  useEffect(() => {
    drawLane();
  }, [drawLane]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const beat = x / zoom;
      const normalizedY = 1 - y / height;
      const value = range.min + normalizedY * (range.max - range.min);

      if (e.shiftKey) {
        onRemovePoint(beat);
      } else {
        onAddPoint(beat, value);
      }
    },
    [zoom, height, range, onAddPoint, onRemovePoint]
  );

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          fontSize: 9,
          color: COLORS.textMuted,
          padding: "2px 4px",
          background: COLORS.laneBg,
        }}
      >
        {lane.parameter} ({lane.mode})
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ width, height, cursor: "crosshair" }}
      />
    </div>
  );
};