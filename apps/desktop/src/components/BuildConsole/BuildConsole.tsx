import { useEffect, useRef, useState } from "react";

export interface BuildLogEntry {
  id: string;
  timestamp: number;
  level: "info" | "success" | "error" | "warn";
  message: string;
  taskId?: string;
  backend?: string;
  metadata?: Record<string, unknown>;
}

interface BuildConsoleProps {
  logs: BuildLogEntry[];
  onClear?: () => void;
  title?: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function BuildConsole({ logs, onClear, title = "Build Console" }: BuildConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "success" | "error" | "warn">("all");

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  const counts = {
    all: logs.length,
    info: logs.filter((l) => l.level === "info").length,
    success: logs.filter((l) => l.level === "success").length,
    error: logs.filter((l) => l.level === "error").length,
    warn: logs.filter((l) => l.level === "warn").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 10px",
          background: "var(--jb-toolbar-bg)",
          borderBottom: "1px solid var(--jb-border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jb-text-muted)" }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {(["all", "info", "success", "warn", "error"] as const).map((f) => (
            <button
              key={f}
              className="jetbee-toolbtn"
              data-active={filter === f}
              onClick={() => setFilter(f)}
              style={{ fontSize: 10, padding: "2px 8px", textTransform: "capitalize" }}
            >
              {f} ({counts[f]})
            </button>
          ))}
          <button
            className="jetbee-toolbtn"
            onClick={onClear}
            title="Clear console"
            style={{ fontSize: 10, padding: "2px 8px" }}
          >
            Clear
          </button>
          <button
            className="jetbee-toolbtn"
            data-active={autoScroll}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll"
            style={{ fontSize: 10, padding: "2px 8px" }}
          >
            Auto
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="jetbee-console"
        style={{ flex: 1, overflow: "auto" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
          setAutoScroll(nearBottom);
        }}
      >
        {filtered.length === 0 && (
          <div style={{ color: "var(--jb-text-faint)", fontStyle: "italic", paddingTop: 20, textAlign: "center" }}>
            No build output yet. Press Ctrl+Shift+G to generate.
          </div>
        )}
        {filtered.map((log) => (
          <div key={log.id} style={{ marginBottom: 2 }}>
            <span className="log-time">{formatTime(log.timestamp)}</span>
            <span className={`log-${log.level}`}>
              {log.backend && (
                <span style={{ color: "var(--jb-text-faint)", marginRight: 6 }}>
                  [{log.backend}]
                </span>
              )}
              {log.taskId && (
                <span style={{ color: "var(--jb-text-faint)", marginRight: 6 }}>
                  {log.taskId.slice(0, 8)}
                </span>
              )}
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
