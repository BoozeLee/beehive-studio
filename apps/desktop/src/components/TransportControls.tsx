interface TransportControlsProps {
  isPlaying: boolean;
  bpm: number;
  currentBeat: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
}

export function TransportControls({
  isPlaying,
  bpm,
  currentBeat,
  onPlay,
  onPause,
  onStop,
  onBpmChange,
}: TransportControlsProps) {
  const formatBeat = (beat: number) => {
    const bars = Math.floor(beat / 4);
    const beats = Math.floor(beat % 4);
    const sixteenths = Math.floor((beat % 1) * 4);
    return `${bars + 1}.${beats + 1}.${sixteenths + 1}`;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "var(--jb-bg-elevated)",
        border: "1px solid var(--jb-border)",
        borderRadius: 8,
      }}
    >
      {/* Play / Pause / Stop */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={isPlaying ? onPause : onPlay}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 6,
            cursor: "pointer",
            background: isPlaying ? "var(--jb-comb)" : "transparent",
            color: isPlaying ? "var(--jb-text-inverse)" : "var(--jb-comb)",
            border: "2px solid var(--jb-comb)",
            transition: "all 0.15s ease",
          }}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={onStop}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            background: "var(--jb-error)",
            color: "#fff",
          }}
        >
          ⏹ Stop
        </button>
      </div>

      {/* BPM */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--jb-text-muted)" }}>BPM</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          min={60}
          max={200}
          style={{
            width: 60,
            padding: "6px 8px",
            fontSize: 14,
            fontWeight: 700,
            background: "var(--jb-bg)",
            color: "var(--jb-text)",
            border: "1px solid var(--jb-border)",
            borderRadius: 4,
            textAlign: "center",
          }}
        />
      </div>

      {/* Position */}
      <div
        style={{
          fontFamily: "var(--jb-font-mono)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--jb-comb)",
          minWidth: 80,
          textAlign: "center",
        }}
      >
        {formatBeat(currentBeat)}
      </div>

      {/* Status indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: isPlaying ? "var(--jb-success)" : "var(--jb-error)",
          marginLeft: "auto",
          boxShadow: isPlaying
            ? "0 0 8px var(--jb-success)"
            : "0 0 4px var(--jb-error)",
        }}
      />
    </div>
  );
}
