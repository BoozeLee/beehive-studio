import React from "react";
import { useProjectStore } from "../../stores/projectStore";

export function TopBar() {
  const { projectName, bpm, isPlaying, togglePlay, stop } = useProjectStore();

  return (
    <div
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "var(--vscode-editor-inactiveSelectionBackground, #1A1410)",
        borderBottom: "1px solid var(--vscode-panel-border, #2A1F18)",
        fontFamily: "var(--vscode-font-family)",
        fontSize: 13,
        color: "var(--vscode-foreground)",
      }}
    >
      <span style={{ fontWeight: 700 }}>🐝 {projectName}</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={togglePlay}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: isPlaying ? "var(--vscode-button-background)" : "transparent",
          color: "var(--vscode-button-foreground)",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        {isPlaying ? "⏸ Pause" : "▶ Play"}
      </button>
      <button
        onClick={stop}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: "transparent",
          color: "var(--vscode-foreground)",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        ⏹ Stop
      </button>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{bpm} BPM</span>
    </div>
  );
}
