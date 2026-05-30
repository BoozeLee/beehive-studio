import React from "react";
import type { Track } from "../../../../../packages/core-models/index";

interface TrackHeaderProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
}

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  selected: "#1a1a2e",
};

export const TrackHeader: React.FC<TrackHeaderProps> = ({
  track,
  isSelected,
  onSelect,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
}) => {
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        height: 40,
        background: isSelected ? COLORS.selected : panelBg(track.type),
        borderBottom: `1px solid ${COLORS.border}`,
        cursor: "pointer",
        userSelect: "none",
        minWidth: 180,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: track.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: isSelected ? 600 : 400,
          color: COLORS.text,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {track.name}
      </span>
      <div style={{ display: "flex", gap: 2 }}>
        <MiniButton
          label="M"
          active={track.muted}
          activeColor="#ef4444"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
        />
        <MiniButton
          label="S"
          active={track.solo}
          activeColor="#fbbf24"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSolo();
          }}
        />
        <MiniButton
          label="R"
          active={track.arm}
          activeColor="#ef4444"
          onClick={(e) => {
            e.stopPropagation();
            onToggleArm();
          }}
        />
      </div>
    </div>
  );
};

function panelBg(type: string): string {
  switch (type) {
    case "audio":
      return "#1a2a1a";
    case "group":
      return "#1a1a2a";
    case "master":
      return "#2a1a1a";
    default:
      return COLORS.panel;
  }
}

function MiniButton({
  label,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        fontSize: 10,
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
