"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { HiveFileTree } from "./HiveFileTree";
import { HiveCodeEditor, type HiveCodeEditorHandle } from "./HiveCodeEditor";
import { HiveLivePreview } from "./HiveLivePreview";
import { HiveChatPanel } from "./HiveChatPanel";
import { HiveNoCodeCanvas } from "./HiveNoCodeCanvas";

type MenuKey = "file" | "agents" | "run" | "projects" | "settings" | null;

const TIER_COLORS: Record<string, string> = {
  queen: "#FFD700", worker: "#FF8C42", drone: "#6366F1",
  forager: "#CE93D8", arrange: "#10B981",
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
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

export default function BeeHiveStudio() {
  const editorRef = useRef<HiveCodeEditorHandle | null>(null);
  const [menuOpen, setMenuOpen] = useState<MenuKey>(null);
  const [agents, setAgents] = useState<{ id: string; label: string; tier: string }[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const toggleAudio = async () => {
    try {
      const { invoke } = (window as any).__TAURI__?.core;
      if (audioPlaying) {
        await invoke?.("stop_audio");
        setAudioPlaying(false);
      } else {
        await invoke?.("start_audio");
        setAudioPlaying(true);
      }
    } catch (e) {
      console.error("Audio failed", e);
    }
  };

  const exportAbleton = async () => {
    try {
      setExportStatus("Fetching arrangement data…");
      const { invoke } = (window as any).__TAURI__?.core;

      const arrangementResp = await invoke?.("get_current_arrangement");
      const arrangement = arrangementResp?.data;

      const midiResp = await invoke?.("list_midi_clips");
      const midiClips = midiResp?.data ?? [];

      const name = arrangement?.name ? arrangement.name.replace(/[^a-zA-Z0-9_ -]/g, "_") : "beehive_project";
      const outputPath = prompt("Save Ableton Live Set as:", `/tmp/${name}.als`);
      if (!outputPath) { setExportStatus(null); return; }

      setExportStatus("Generating .als file…");
      const result = await invoke?.("export_ableton", {
        arrangement,
        midiClips,
        audioClips: [],
        outputPath,
      });
      const msg = "Exported: " + (result?.data ?? outputPath);
      setExportStatus(msg);
      setTimeout(() => setExportStatus(null), 5000);
    } catch (e: any) {
      console.error("Export failed", e);
      setExportStatus("Export failed: " + e);
      setTimeout(() => setExportStatus(null), 5000);
    }
  };

  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [scaffoldDesc, setScaffoldDesc] = useState("");
  const [scaffoldTemplate, setScaffoldTemplate] = useState("fastapi-crud");
  const [scaffoldDir, setScaffoldDir] = useState("/tmp/hive_project");
  const [scaffoldResult, setScaffoldResult] = useState<string[] | null>(null);
  const [scaffolding, setScaffolding] = useState(false);

  useClickOutside(menuBarRef, () => setMenuOpen(null));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        if (activeFile && !running) runActiveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeFile, running]);

  const toggleMenu = (key: MenuKey) => setMenuOpen((prev) => (prev === key ? null : key));

  const handleOpenFile = (path: string, content: string) => {
    editorRef.current?.openTab(path, content);
  };

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
      const res = await fetch("/tools/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_path: "/tmp", entry: activeFile, timeout: 30 }),
      });
      const j = await res.json();
      setRunOutput(j.output ?? ["(no output)"]);
    } catch {
      setRunOutput(["(run failed — tools server offline?)"]);
    } finally {
      setRunning(false);
    }
  };

  const scaffold = async () => {
    if (!scaffoldDesc.trim()) return;
    setScaffolding(true);
    setScaffoldResult(null);
    try {
      const res = await fetch("/tools/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: scaffoldDesc, template: scaffoldTemplate, target_dir: scaffoldDir }),
      });
      const j = await res.json();
      const files = (j.files ?? []).map((f: { path?: string; type?: string }) => f.path ?? f.type ?? JSON.stringify(f));
      setScaffoldResult(files.length ? files : ["(no files returned)"]);
    } catch {
      setScaffoldResult(["(scaffold failed — tools server offline?)"]);
    } finally {
      setScaffolding(false);
    }
  };

  const menus: { key: MenuKey; label: string; items: React.ReactNode }[] = [
    {
      key: "file",
      label: "File",
      items: (
        <>
          <MenuItem label="New File" onClick={() => { editorRef.current?.openTab("untitled.py", ""); setMenuOpen(null); }} />
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
          <MenuItem label="Scaffold from Template…" onClick={() => { setMenuOpen(null); setScaffoldOpen(true); }} />
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
      <div className="flex items-center justify-between px-3 bh-menu-bar" style={{ height: "var(--bh-toolbar-height)" }}>
        <div className="flex items-center gap-1" ref={menuBarRef}>
          <span className="font-semibold mr-3 text-sm" style={{ color: "var(--bh-accent)" }}>🐝 BeeHive Studio</span>
          {menus.map(({ key, label, items }) => (
            <div key={key} className="relative">
              <button
                type="button"
                onClick={() => { toggleMenu(key); if (key === "agents") loadAgents(); }}
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
          <button
            onClick={toggleAudio}
            className={`ml-4 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bh-btn ${audioPlaying ? "bh-btn-accent" : ""}`}
          >
            {audioPlaying ? "Audio: ON" : "Audio: OFF"}
          </button>
          <button
            onClick={exportAbleton}
            className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bh-btn"
            style={{ background: "var(--bh-agent-drone)", color: "var(--bh-text)", borderColor: "var(--bh-agent-drone)" }}
          >
            Export Ableton
          </button>
        </div>
        {running && <span className="text-xs animate-pulse" style={{ color: "var(--bh-accent)" }}>Running…</span>}
        {exportStatus && (
          <span className="text-xs animate-pulse" style={{ color: "var(--bh-agent-drone)" }}>{exportStatus}</span>
        )}
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
        <div className="flex flex-1 overflow-hidden" style={{ width: "56px" }}>
          <HiveFileTree onOpenFile={handleOpenFile} />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <HiveCodeEditor ref={editorRef} onActiveFileChange={setActiveFile} />
            </div>
            <div className="flex-shrink-0" style={{ width: "320px" }}>
              <HiveLivePreview />
            </div>
          </div>
          <div className="flex-shrink-0" style={{ height: "256px" }}>
            <HiveNoCodeCanvas onGeneratedCode={(code) => editorRef.current?.openTab("canvas_output.py", code)} />
          </div>
        </div>
        <div className="flex-shrink-0" style={{ width: "320px" }}>
          <HiveChatPanel />
        </div>
      </div>

      {scaffoldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-lg shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto p-5 text-sm"
            style={{ background: "var(--bh-panel)", border: "1px solid var(--bh-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: "var(--bh-accent)" }}>Scaffold New Project</span>
              <button type="button" onClick={() => { setScaffoldOpen(false); setScaffoldResult(null); }}
                className="hover:text-white" style={{ color: "var(--bh-text-faint)" }}>✕</button>
            </div>
            <label className="block text-xs mb-1" style={{ color: "var(--bh-text-muted)" }}>Description</label>
            <textarea
              className="bh-input w-full resize-none mb-3"
              rows={3} value={scaffoldDesc} onChange={(e) => setScaffoldDesc(e.target.value)}
              placeholder="A FastAPI service that tracks crypto prices…"
            />
            <div className="flex gap-3 mb-3">
              <label className="flex-1">
                <div className="text-xs mb-1" style={{ color: "var(--bh-text-muted)" }}>Template</div>
                <select className="bh-select w-full" value={scaffoldTemplate} onChange={(e) => setScaffoldTemplate(e.target.value)}>
                  <option value="fastapi-crud">FastAPI CRUD</option>
                  <option value="streamlit-dashboard">Streamlit Dashboard</option>
                  <option value="react-vite">React + Vite</option>
                  <option value="nextjs-app">Next.js App Router</option>
                  <option value="cli-rich">Python CLI (Rich)</option>
                  <option value="rust-axum">Rust Axum</option>
                </select>
              </label>
              <label className="flex-1">
                <div className="text-xs mb-1" style={{ color: "var(--bh-text-muted)" }}>Target directory</div>
                <input className="bh-input w-full" value={scaffoldDir} onChange={(e) => setScaffoldDir(e.target.value)} />
              </label>
            </div>
            <button type="button" onClick={scaffold} disabled={scaffolding || !scaffoldDesc.trim()}
              className="w-full rounded py-1.5 text-xs font-medium bh-btn-accent disabled:opacity-50 mb-3">
              {scaffolding ? "Scaffolding…" : "Generate Project"}
            </button>
            {scaffoldResult && (
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--bh-text-muted)" }}>Created files:</div>
                <div className="rounded p-2 max-h-40 overflow-y-auto bh-scrollable" style={{ background: "var(--bh-bg)" }}>
                  {scaffoldResult.map((f, i) => (
                    <div key={i} className="text-[10px] font-mono" style={{ color: "var(--bh-success)" }}>{f}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
