import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";

export function TransportBar() {
  const project = useProjectStore((s) => s.project);
  const {
    playing,
    bpm,
    currentBeat,
    timeSignature,
    isLooping,
    metronomeEnabled,
    recordEnabled,
    isRecording,
    toggle,
    stop,
    play,
    seekToStart,
    setBpm,
    toggleLoop,
    toggleMetronome,
    toggleRecordArm,
  } = useTransportStore();

  const barLength = timeSignature.numerator;
  const bar = Math.floor(currentBeat / barLength) + 1;
  const beatInBar = Math.floor(currentBeat % barLength) + 1;
  const sixteenth = Math.floor((currentBeat % 1) * 4) + 1;

  const btn = (active?: boolean, color?: string): React.CSSProperties => ({
    padding: "4px 10px",
    minWidth: 32,
    background: active ? color || "#ef4444" : "var(--vscode-button-background)",
    color: active ? "#000" : "var(--vscode-button-foreground)",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={seekToStart} style={btn()} title="Go to start">
        ⏮
      </button>
      <button onClick={() => void toggle()} style={btn()} title="Play/Pause">
        {playing ? "⏸" : "▶"}
      </button>
      <button onClick={stop} style={btn()} title="Stop">
        ⏹
      </button>
      <button
        onClick={() => {
          if (isRecording) {
            stop();
          } else if (recordEnabled) {
            void play();
          } else {
            toggleRecordArm();
          }
        }}
        style={btn(recordEnabled || isRecording, isRecording ? "#ef4444" : undefined)}
        title={isRecording ? "Stop recording" : recordEnabled ? "Start recording" : "Arm record"}
      >
        ⏺
      </button>
      <button
        onClick={toggleLoop}
        style={btn(isLooping, "#4ade80")}
        title="Toggle loop"
      >
        🔁
      </button>
      <button
        onClick={toggleMetronome}
        style={btn(metronomeEnabled, "#f5c542")}
        title="Toggle metronome"
      >
        🥁
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 8px",
          background: "var(--vscode-panel-background)",
          border: "1px solid var(--vscode-panel-border)",
          borderRadius: 4,
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>
          {bar}.{beatInBar}.{sixteenth}
        </span>
        <span style={{ opacity: 0.5 }}>/</span>
        <span>
          {timeSignature.numerator}/{timeSignature.denominator}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, opacity: 0.7 }}>BPM</span>
        <input
          type="number"
          min={20}
          max={300}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          style={{
            width: 50,
            padding: "3px 6px",
            background: "var(--vscode-editor-background)",
            color: "var(--vscode-foreground)",
            border: "1px solid var(--vscode-panel-border)",
            borderRadius: 4,
            fontSize: 12,
          }}
        />
      </div>

      <span style={{ fontSize: 11, opacity: 0.7, maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {project ? project.name : "No project"}
      </span>
    </div>
  );
}
