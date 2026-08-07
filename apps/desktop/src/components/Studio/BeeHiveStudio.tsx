"use client";

import React, { useRef, useState } from "react";
import { HiveFileTree } from "./HiveFileTree";
import { HiveChatPanel } from "./HiveChatPanel";

type MenuKey = "file" | "agents" | "run" | "projects" | "settings" | null;

const TIER_COLORS: Record<string, string> = {
  queen: "#FFD700", worker: "#FF8C42", drone: "#6366F1",
  forager: "#CE93D8", arrange: "#10B981",
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const [, setDirty] = useState(0);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}

function MenuItem({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="bh-menu-item w-full text-left">
      {label}
    </button>
  );
}

interface BeeHiveStudioProps {
  topBar?: React.ReactNode;
  center: React.ReactNode;
  rightRail?: React.ReactNode;
  bottomRail?: React.ReactNode;
  statusBar?: React.ReactNode;
  leftRail?: React.ReactNode;
  projectName?: string;
  projectRoot?: string;
}

export default function BeeHiveStudio({ topBar, center, rightRail, bottomRail, statusBar, leftRail, projectName, projectRoot }: BeeHiveStudioProps) {
  const [menuOpen, setMenuOpen] = useState<MenuKey>(null);
  const [agents, setAgents] = useState<{ id: string; label: string; tier: string }[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);

  useClickOutside(menuBarRef, () => setMenuOpen(null));

  const loadAgents = async () => {
    if (agentsLoaded) return;
    try {
      const res = await fetch("/tools/agents");
      const j = await res.json();
      setAgents(j.agents ?? []);
      setAgentsLoaded(true);
    } catch { /* hive offline */ }
  };

  const runActiveFile = async () => {
    if (!activeFile) return;
    setMenuOpen(null);
    setRunning(true);
    setRunOutput(["Running…"]);
    try {
      const body: Record<string, unknown> = {
        entry: activeFile,
        timeout: 30,
      };
      if (projectRoot) {
        body.root = projectRoot;
      }
      const res = await fetch("/tools/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      setRunOutput(j.output ?? ["(no output)"]);
    } catch {
      setRunOutput(["(run failed — tools server offline?)"]);
    } finally {
      setRunning(false);
    }
  };

  const menus: { key: MenuKey; label: string; items: React.ReactNode }[] = [
    {
      key: "file",
      label: "File",
      items: (
        <>
          <MenuItem label="New File" onClick={() => { /* TODO: project-aware new file */ setMenuOpen(null); }} />
          <MenuItem label="Refresh File Tree" onClick={() => { window.dispatchEvent(new Event("hive:refresh-files")); setMenuOpen(null); }} />
        </>
      ),
    },
    {
      key: "agents",
      label: "Agents",
      items: (
        <div className="min-w-[220px] max-h-72 overflow-y-auto bh-scrollable">
          {agents.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: "var(--bh-text-faint)" }}>Loading…</div>}
          {agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-xs" style={{ color: "var(--bh-text-muted)" }}>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[a.tier] ?? "#888" }} />
              <span className="flex-1 truncate">{a.label}</span>
              <span className="text-[10px] truncate" style={{ color: "var(--bh-text-faint)" }}>{a.id}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "run",
      label: "Run",
      items: (
        <>
          <MenuItem
            label={activeFile ? `Run ${activeFile.split("/").pop()} (F5)` : "Run Active File (no file open)"}
            onClick={activeFile ? runActiveFile : undefined}
          />
        </>
      ),
    },
    {
      key: "projects",
      label: "Projects",
      items: (
        <>
          <MenuItem label="New Project" onClick={() => { setMenuOpen(null); /* TODO */ }} />
          <MenuItem label="Open Project" onClick={() => { setMenuOpen(null); /* TODO */ }} />
        </>
      ),
    },
    {
      key: "settings",
      label: "Settings",
      items: (
        <div className="min-w-[240px] px-3 py-2 text-xs space-y-1.5" style={{ color: "var(--bh-text-muted)" }}>
          <div>Orchestrator: <span style={{ color: "var(--bh-text)" }}>http://127.0.0.1:8000</span></div>
          <div>Tools server: <span style={{ color: "var(--bh-text)" }}>http://127.0.0.1:8787</span></div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--bh-bg)", color: "var(--bh-text)" }}>
      {topBar && (
        <div className="flex-shrink-0" style={{ borderBottom: "1px solid var(--bh-border)", background: "var(--bh-toolbar-bg)" }}>
          {topBar}
        </div>
      )}

      <div className="flex items-center justify-between px-3 bh-menu-bar" style={{ height: "var(--bh-toolbar-height)", borderBottom: "1px solid var(--bh-border)" }}>
        <div className="flex items-center gap-1" ref={menuBarRef}>
          <span className="font-semibold mr-3 text-sm" style={{ color: "var(--bh-accent)" }}>🐝 BeeHive Studio</span>
          {menus.map(({ key, label, items }) => (
            <div key={key} className="relative">
              <button
                type="button"
                onClick={() => { setMenuOpen(key); if (key === "agents") loadAgents(); }}
                className={`px-2 py-1 rounded text-xs ${menuOpen === key ? "bg-[var(--bh-panel-hover)]" : ""}`}
                style={{ color: menuOpen === key ? "var(--bh-text)" : "var(--bh-text-muted)" }}>
                {label}
              </button>
              {menuOpen === key && (
                <div className="absolute top-full left-0 z-50 mt-0.5 bh-menu-dropdown">
                  {items}
                </div>
              )}
            </div>
          ))}
          {activeFile && (
            <span className="ml-3 text-[10px] truncate max-w-xs" style={{ color: "var(--bh-text-faint)" }}>{activeFile}</span>
          )}
        </div>
        {running && <span className="text-xs animate-pulse" style={{ color: "var(--bh-accent)" }}>Running…</span>}
      </div>

      {runOutput && (
        <div className="border-b px-3 py-2 text-xs font-mono overflow-y-auto" style={{ borderColor: "var(--bh-border)", color: "var(--bh-success)", background: "var(--bh-bg)", maxHeight: "128px" }}>
          <div className="flex items-center justify-between mb-1">
            <span style={{ color: "var(--bh-text-faint)" }}>Run output</span>
            <button type="button" onClick={() => setRunOutput(null)} className="hover:text-white" style={{ color: "var(--bh-text-faint)" }}>✕</button>
          </div>
          {runOutput.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0, minWidth: 0 }}>
              {center}
            </div>
            {rightRail && (
              <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: "320px", borderLeft: "1px solid var(--bh-border)" }}>
                <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
                  {rightRail}
                </div>
                <div className="flex-shrink-0" style={{ height: "320px", borderTop: "1px solid var(--bh-border)" }}>
                  <HiveChatPanel />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="w-56 flex-shrink-0 flex flex-col bh-rail" style={{ borderLeft: "1px solid var(--bh-border)" }}>
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            <HiveFileTree onOpenFile={(path) => setActiveFile(path)} />
          </div>
          {leftRail && (
            <div className="flex-shrink-0 overflow-hidden" style={{ height: "40%", borderTop: "1px solid var(--bh-border)" }}>
              {leftRail}
            </div>
          )}
        </div>
      </div>

      {bottomRail && (
        <div className="flex-shrink-0" style={{ height: "200px", borderTop: "1px solid var(--bh-border)" }}>
          {bottomRail}
        </div>
      )}

      {statusBar && (
        <div className="bh-statusbar flex-shrink-0">
          {statusBar}
        </div>
      )}
    </div>
  );
}
