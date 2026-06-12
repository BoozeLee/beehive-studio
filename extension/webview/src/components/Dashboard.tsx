import React, { useEffect, useState } from "react";

const BACKEND_URL = "http://127.0.0.1:9876";

export function Dashboard() {
  const [status, setStatus] = useState("Checking backend...");
  const [health, setHealth] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/health`);
        const data = await res.json();
        setHealth(data);
        setStatus(`Gateway: ${data.status} (${data.version})`);
      } catch {
        setHealth(null);
        setStatus("Gateway unavailable on port 9876");
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, height: "100%" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>🐝 Beehive Studio</h1>
      <p style={{ margin: 0, opacity: 0.8 }}>{status}</p>
      {health && (
        <pre
          style={{
            background: "var(--vscode-input-background)",
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            maxWidth: 480,
            overflow: "auto",
          }}
        >
          {JSON.stringify(health, null, 2)}
        </pre>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={async () => {
            try {
              const res = await fetch(`${BACKEND_URL}/hive999/health`);
              const data = await res.json();
              alert(`Hive 999: ${JSON.stringify(data, null, 2)}`);
            } catch {
              alert("Hive 999 unreachable");
            }
          }}
          style={{
            padding: "8px 16px",
            background: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Check Hive 999
        </button>
        <button
          onClick={async () => {
            try {
              const res = await fetch(`${BACKEND_URL}/music/acestep/models`);
              const data = await res.json();
              alert(`Models: ${JSON.stringify(data, null, 2)}`);
            } catch {
              alert("Gateway unreachable");
            }
          }}
          style={{
            padding: "8px 16px",
            background: "var(--vscode-button-secondaryBackground)",
            color: "var(--vscode-button-secondaryForeground)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          List ACE-Step Models
        </button>
      </div>
      <p style={{ fontSize: 11, opacity: 0.5, marginTop: 24 }}>
        Beehive Studios v0.5.0 · VS Code Extension Mode
      </p>
    </div>
  );
}
