import { BackendHealth } from "../BackendHealth";

interface StatusBarProps {
  wsConnected: boolean;
  wsReconnecting: boolean;
  isPlaying: boolean;
  status: string;
  hiveLoading: boolean;
  hiveDegraded: boolean;
}

export function StatusBar({
  wsConnected,
  wsReconnecting,
  isPlaying,
  status,
  hiveLoading,
  hiveDegraded,
}: StatusBarProps) {
  return (
    <div className="jetbee-statusbar">
      <div className="jetbee-statusbar-section">
        <span
          className="jetbee-statusbar-chip"
          style={{
            color: wsConnected
              ? "var(--jb-success)"
              : wsReconnecting
                ? "var(--jb-warning)"
                : "var(--jb-error)",
          }}
        >
          {wsConnected ? "● WS" : wsReconnecting ? "◐ WS" : "○ WS"}
        </span>
        <span className="jetbee-statusbar-chip">
          <BackendHealth />
        </span>
        <span
          className="jetbee-statusbar-chip"
          style={{
            color:
              !hiveDegraded && !hiveLoading
                ? "var(--jb-success)"
                : hiveLoading
                  ? "var(--jb-warning)"
                  : "var(--jb-text-muted)",
          }}
        >
          {hiveLoading ? "◐ Hive" : !hiveDegraded ? "● Hive" : "○ Hive"}
        </span>
        <span className="jetbee-statusbar-chip">Ollama: 11434</span>
        <span className="jetbee-statusbar-chip">Baker Street: 3001</span>
        <span>{isPlaying ? "▶ Playing" : "⏹ Stopped"}</span>
      </div>
      <div className="jetbee-statusbar-section" style={{ marginLeft: "auto" }}>
        <span>{status}</span>
        <span>JetBee v0.6.0-alpha</span>
      </div>
    </div>
  );
}
