import { BEEHIVE, commonStyles } from "../../lib/theme";
import { useKeyboardStore } from "../../lib/keyboardStore";

interface TopBarProps {
  projectName: string;
  bpm: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onSave: () => void;
  onExport: () => void;
  onOpenProject: () => void;
  onPublish?: () => void;
}

export function TopBar({ projectName, bpm, isPlaying, onPlayPause, onStop, onSave, onExport, onOpenProject, onPublish }: TopBarProps) {
  const openPalette = useKeyboardStore((s) => s.openPalette);

  return (
    <div
      style={{
        height: 38,
        background: "var(--jb-toolbar-bg)",
        borderBottom: "1px solid var(--jb-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: `linear-gradient(135deg, ${BEEHIVE.comb}, ${BEEHIVE.amber})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "#000",
          }}
        >
          B
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: BEEHIVE.text }}>{projectName}</span>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        <button style={commonStyles.toolBtn} onClick={onOpenProject}>Open</button>
        <button style={commonStyles.toolBtn} onClick={onSave}>Save</button>
        <button style={commonStyles.toolBtn} onClick={onExport}>Export</button>
        {onPublish && (
          <button style={commonStyles.toolBtn} onClick={onPublish} title="Render & publish to MixHive">
            🌐 Publish
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <span style={{ fontSize: 11, color: BEEHIVE.textMuted, fontFamily: "var(--jb-font-mono)" }}>{bpm} BPM</span>
        <button
          onClick={onPlayPause}
          style={{ ...commonStyles.toolBtn, background: isPlaying ? BEEHIVE.comb : "transparent", color: isPlaying ? "#000" : BEEHIVE.text }}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button style={commonStyles.toolBtn} onClick={onStop}>⏹ Stop</button>
        <button style={commonStyles.toolBtn} onClick={openPalette} title="Ctrl+Shift+A">
          ⌘ Command Palette
        </button>
      </div>
    </div>
  );
}
