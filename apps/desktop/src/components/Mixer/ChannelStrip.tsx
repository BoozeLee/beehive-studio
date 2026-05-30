import React, { useRef, useEffect, useCallback } from "react";
import type { Track } from "../../../../../packages/core-models/index";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  meter: "#4ade80",
  meterPeak: "#fbbf24",
  meterClip: "#ef4444",
};

interface ChannelStripProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmToggle: () => void;
  level?: number;
  peak?: number;
}

export const ChannelStrip: React.FC<ChannelStripProps> = ({
  track,
  isSelected,
  onSelect,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  level = 0,
  peak = 0,
}) => {
  const meterRef = useRef<HTMLCanvasElement>(null);

  const drawMeter = useCallback(() => {
    const canvas = meterRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const h = canvas.height;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, h);

    const levelHeight = Math.min(level, 1) * h;
    const peakY = h - Math.min(peak, 1) * h;

    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, COLORS.meter);
    gradient.addColorStop(0.7, COLORS.meter);
    gradient.addColorStop(0.85, COLORS.meterPeak);
    gradient.addColorStop(1, COLORS.meterClip);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, h - levelHeight, w, levelHeight);

    ctx.fillStyle = peak > 0.85 ? COLORS.meterClip : COLORS.meterPeak;
    ctx.fillRect(0, peakY, w, 2);
  }, [level, peak]);

  useEffect(() => {
    drawMeter();
  }, [drawMeter]);

  const trackTypeColor = {
    midi: "#ff8c42",
    audio: "#4ade80",
    group: "#60a5fa",
    return: "#a78bfa",
    master: "#ef4444",
  }[track.type] || COLORS.textMuted;

  return (
    <div
      onClick={onSelect}
      style={{
        width: 72,
        padding: "6px 4px",
        background: isSelected
          ? `${trackTypeColor}11`
          : COLORS.panel,
        border: `1px solid ${isSelected ? trackTypeColor : COLORS.border}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        opacity: track.muted ? 0.5 : 1,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: track.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 9,
          color: COLORS.text,
          fontWeight: isSelected ? 600 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 60,
          textAlign: "center",
        }}
      >
        {track.name}
      </span>

      <canvas
        ref={meterRef}
        width={8}
        height={80}
        style={{
          width: 8,
          height: 80,
          borderRadius: 2,
          background: COLORS.bg,
        }}
      />

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={track.volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        style={{ width: 60, accentColor: trackTypeColor }}
        title={`Vol: ${(track.volume * 100).toFixed(0)}%`}
      />

      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={track.pan}
        onChange={(e) => onPanChange(parseFloat(e.target.value))}
        style={{
          width: 60,
          accentColor: "#888",
        }}
        title={`Pan: ${track.pan > 0 ? `R${(track.pan * 100).toFixed(0)}` : track.pan < 0 ? `L${(-track.pan * 100).toFixed(0)}` : "C"}`}
      />

      <div style={{ display: "flex", gap: 2 }}>
        <MiniBtn
          label="M"
          active={track.muted}
          activeColor={COLORS.meterClip}
          onClick={onMuteToggle}
        />
        <MiniBtn
          label="S"
          active={track.solo}
          activeColor={COLORS.meterPeak}
          onClick={onSoloToggle}
        />
        <MiniBtn
          label="R"
          active={track.arm}
          activeColor={COLORS.meterClip}
          onClick={onArmToggle}
        />
      </div>

      <span style={{ fontSize: 8, color: COLORS.textMuted }}>
        {(track.volume * 100).toFixed(0)}%
      </span>
    </div>
  );
};

function MiniBtn({
  label,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 18,
        height: 18,
        fontSize: 8,
        fontWeight: 700,
        border: `1px solid ${active ? activeColor : COLORS.border}`,
        borderRadius: 3,
        background: active ? activeColor : "transparent",
        color: active ? "#000" : COLORS.textMuted,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}