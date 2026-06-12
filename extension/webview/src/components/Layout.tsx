import { ReactNode, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastContainer } from "./ToastContainer";
import { BuildConsole, type BuildLogEntry } from "./desktop/BuildConsole/BuildConsole";
import { useProjectStore } from "../stores/projectStore";

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const { buildJobs } = useProjectStore();
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);

  useMemo(() => {
    const nextLogs: BuildLogEntry[] = [];
    for (const job of buildJobs) {
      nextLogs.push({
        id: `${job.id}-status`,
        timestamp: Date.now(),
        level: job.status === "failed" ? "error" : job.status === "completed" ? "success" : "info",
        message: `Build ${job.id.slice(0, 8)} is ${job.status}`,
        backend: job.provider || undefined,
      });
      if (job.error) {
        nextLogs.push({
          id: `${job.id}-error`,
          timestamp: Date.now(),
          level: "error",
          message: job.error,
          backend: job.provider || undefined,
        });
      }
    }
    if (nextLogs.length > 0) {
      setLogs((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        const newLogs = nextLogs.filter((l) => !existingIds.has(l.id));
        return [...prev, ...newLogs];
      });
    }
  }, [buildJobs]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "var(--vscode-background)",
        color: "var(--vscode-foreground)",
      }}
    >
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderLeft: "1px solid var(--vscode-panel-border)",
          }}
        >
          {children}
        </main>
      </div>
      <div
        style={{
          height: 160,
          borderTop: "1px solid var(--vscode-panel-border)",
          backgroundColor: "var(--vscode-panel-background)",
          flexShrink: 0,
        }}
      >
        <BuildConsole logs={logs} onClear={() => setLogs([])} />
      </div>
      <ToastContainer />
    </div>
  );
}
