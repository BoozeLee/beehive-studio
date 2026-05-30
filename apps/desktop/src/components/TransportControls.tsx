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
        background: "#18181c",
        border: "1px solid #2a2a30",
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
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            background: isPlaying ? "#fbbf24" : "#4ade80",
            color: "#000",
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
            background: "#ef4444",
            color: "#fff",
          }}
        >
          ⏹ Stop
        </button>
      </div>

      {/* BPM */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#888" }}>BPM</span>
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
            background: "#0f0f12",
            color: "#e0e0e0",
            border: "1px solid #2a2a30",
            borderRadius: 4,
            textAlign: "center",
          }}
        />
      </div>

      {/* Position */}
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 16,
          fontWeight: 700,
          color: "#ff8c42",
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
          background: isPlaying ? "#4ade80" : "#ef4444",
          marginLeft: "auto",
          boxShadow: isPlaying
            ? "0 0 8px #4ade80"
            : "0 0 4px #ef4444",
        }}
      />
    </div>
  );
}
