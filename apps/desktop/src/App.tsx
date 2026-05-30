import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionViewGrid } from "./components/SessionView/SessionViewGrid";
import { BackendHealth } from "./components/BackendHealth";
import { TransportControls } from "./components/TransportControls";
import { useTransport, ScheduledClip } from "./lib/transport";
import { saveProject, loadProject, listProjects, deleteProject } from "./lib/db";
import { MidiIoPanel } from "./components/MidiIoPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { useTimelineStore } from "./lib/timelineStore";
import { PatternEditor } from "./components/PatternEditor/PatternEditor";
import type { PatternState } from "./components/PatternEditor/PatternEditor";

interface Clip {
  id: string;
  name: string;
  duration?: number;
  color?: string;
  midiData?: {
    notes: Array<{
      pitch: number;
      velocity: number;
      start: number;
      duration: number;
    }>;
  };
  reasoning?: string[];
}

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  accentHover: "#ffaa66",
  text: "#e0e0e0",
  textMuted: "#888",
  success: "#4ade80",
  error: "#ef4444",
  warning: "#fbbf24",
};

function App() {
  const [brief, setBrief] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [showLua, setShowLua] = useState(false);
  const [researchResult, setResearchResult] = useState<string>("");
  const [showResearch, setShowResearch] = useState(false);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [luaScript, setLuaScript] = useState(
    `-- Beehive Studio Lua Script\n-- Generate music events programmatically\nlocal events = {}\nfor i = 1, 8 do\n  local on, off = music.play_note{\n    pitch = 36 + i,\n    velocity = 100,\n    duration = 0.25,\n    time = i * 0.25,\n    channel = 0\n  }\n  table.insert(events, on)\n  table.insert(events, off)\nend\nreturn {\n  name = "Generated Pattern",\n  events = events,\n  count = #events\n}\n`
  );
  const [luaResult, setLuaResult] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const transport = useTransport();
  const [showTimeline, setShowTimeline] = useState(false);
  const { setClips: setTimelineClips, addTrack } = useTimelineStore();
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [_, setDrumPattern] = useState<PatternState | null>(null);

  // Load saved projects on mount
  useEffect(() => {
    listProjects().then(setSavedProjects).catch(() => {});
  }, []);

  // Sync clips to timeline store
  useEffect(() => {
    if (!showTimeline || clips.length === 0) return;
    const clipMap: Record<string, Clip> = {};
    for (const clip of clips) {
      clipMap[clip.id] = clip as unknown as Clip;
    }
    setTimelineClips(clipMap as never);

    const { tracks } = useTimelineStore.getState();
    if (tracks.length === 0) {
      const trackId = crypto.randomUUID();
      addTrack({
        id: trackId,
        name: "Track 1",
        type: "midi",
        color: COLORS.accent,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        arm: false,
        clips: clips.map((c) => c.id),
        automationLanes: [],
      });
    }
  }, [clips, showTimeline]);

  // Play a single clip using the transport
  const playClip = useCallback(
    (clip: Clip) => {
      if (!clip.midiData?.notes?.length) {
        alert("No MIDI data in this clip");
        return;
      }

      setStatus("Playing clip...");

      const scheduled: ScheduledClip = {
        id: clip.id,
        notes: clip.midiData.notes,
        startBeat: 0,
        loop: false,
        channel: 0,
      };

      transport.clearAll();
      transport.scheduleClip(scheduled);
      transport.play();
    },
    [transport]
  );

  async function sendBrief(variationBrief?: string) {
    const text = variationBrief ?? brief;
    if (!text.trim()) return;

    setIsLoading(true);
    setStreamLog([]);
    setStatus(
      variationBrief ? "Generating variation..." : "Agent thinking..."
    );

    try {
      const data = await invoke<{
        task_id: string;
        status: string;
        reasoning: string[];
        clip_preview: { notes: any[] };
      }>("send_brief", {
        brief: text.trim(),
        sessionContext: {
          bpm: transport.bpm,
          swing: 0.68,
          session_id: "demo-session-1",
        },
      });

      const newClip: Clip = {
        id: data.task_id || crypto.randomUUID(),
        name: text.slice(0, 40) + (text.length > 40 ? "..." : ""),
        midiData: data.clip_preview,
        reasoning: data.reasoning,
      };

      setClips((prev) => [...prev, newClip]);
      if (!variationBrief) setBrief("");
      setStatus(
        variationBrief
          ? "Variation ready"
          : "Clip generated — click Play"
      );
      setStreamLog(data.reasoning || []);
    } catch (err) {
      console.error(err);
      setStatus("Backend error — is it running on port 9876?");
    } finally {
      setIsLoading(false);
    }
  }

  async function doResearch() {
    if (!brief.trim()) return;
    setIsLoading(true);
    setStatus("Researching with Baker Street...");
    try {
      const data = await invoke<{
        status: string;
        formatted_context?: string;
        error?: string;
      }>("do_research", {
        query: brief.trim(),
      });
      if (data.status === "ok" && data.formatted_context) {
        setResearchResult(data.formatted_context);
        setShowResearch(true);
        setStatus("Research complete");
      } else {
        setResearchResult(`Research: ${data.error || "No results"}`);
        setStatus("Research unavailable");
      }
    } catch (err) {
      setStatus("Baker Street not running on port 3001");
    } finally {
      setIsLoading(false);
    }
  }

  function acceptClip(_id: string) {
    setStatus(`✓ Clip accepted`);
  }

  function rejectClip(id: string) {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setStatus("Clip rejected");
  }

  function generateVariations(id: string) {
    const clip = clips.find((c) => c.id === id);
    if (clip) {
      const baseBrief = clip.name
        .replace(" (variation...)", "")
        .replace("...", "");
      sendBrief(baseBrief + " (variation, keep the vibe)");
    }
  }

  async function runLua() {
    setStatus("Running Lua...");
    try {
      const data = await invoke<{
        status: string;
        result?: any;
        error?: string;
      }>("run_lua_script", {
        script: luaScript,
        sessionId: "demo-session-1",
      });
      if (data.status === "ok") {
        setLuaResult(JSON.stringify(data.result, null, 2));
        setStatus("Lua executed");
      } else {
        setLuaResult(`Error: ${data.error}`);
        setStatus("Lua failed");
      }
    } catch (err) {
      setLuaResult(`Error: ${String(err)}`);
      setStatus("Lua error");
    }
  }

  async function handleSaveProject() {
    if (clips.length === 0) {
      setStatus("Nothing to save — generate some clips first");
      return;
    }
    try {
      await saveProject(projectName, clips);
      const projects = await listProjects();
      setSavedProjects(projects);
      setStatus(`✓ Saved "${projectName}" (${clips.length} clips)`);
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  }

  async function handleLoadProject(name: string) {
    try {
      const loaded = await loadProject(name);
      setClips(loaded);
      setProjectName(name);
      setStatus(`✓ Loaded "${name}" (${loaded.length} clips)`);
    } catch (err) {
      setStatus(`Load failed: ${String(err)}`);
    }
  }

  async function handleExportMidi() {
    if (clips.length === 0) {
      setStatus("Nothing to export — generate some clips first");
      return;
    }
    setStatus("Exporting MIDI...");
    try {
      const tempPath = await invoke<string>("export_midi", {
        clips: clips.map((c) => ({ ...c, midiData: c.midiData ?? {} })),
        bpm: transport.bpm,
        filename: projectName.replace(/\s+/g, "-").toLowerCase(),
      });
      // Use Tauri dialog to let user pick save location
      const { save } = await import("@tauri-apps/plugin-dialog");
      const savePath = await save({
        defaultPath: `${projectName.replace(/\s+/g, "-").toLowerCase()}.mid`,
        filters: [{ name: "MIDI", extensions: ["mid"] }],
      });
      if (savePath) {
        const contents = await invoke<number[]>("read_file_bytes", { path: tempPath });
        const binary = new Uint8Array(contents);
        await invoke("write_file_bytes", { path: savePath, data: Array.from(binary) });
        setStatus(`✓ Exported to ${savePath}`);
      } else {
        setStatus("Export cancelled");
      }
    } catch (err) {
      setStatus(`Export failed: ${String(err)}`);
    }
  }

  async function handleDeleteProject(name: string) {
    try {
      await deleteProject(name);
      const projects = await listProjects();
      setSavedProjects(projects);
      setStatus(`✓ Deleted "${name}"`);
    } catch (err) {
      setStatus(`Delete failed: ${String(err)}`);
    }
  }

  const buttonStyle = (disabled = false): React.CSSProperties => ({
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#333" : COLORS.accent,
    color: disabled ? "#666" : "#000",
    opacity: disabled ? 0.6 : 1,
    transition: "all 0.2s",
  });

  const panelStyle: React.CSSProperties = {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: 16,
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: COLORS.bg,
        color: COLORS.text,
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentHover})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
              color: "#000",
            }}
          >
            B
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              Beehive Studio
            </h1>
            <p
              style={{ color: COLORS.textMuted, margin: "2px 0 0", fontSize: 12 }}
            >
              AI Agent Music Production
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowProjects(!showProjects)}
            style={{
              ...buttonStyle(),
              background: "#2a2a30",
              color: COLORS.text,
            }}
          >
            {showProjects ? "Hide Projects" : "Projects"}
          </button>
          <button
            onClick={() => setShowResearch(!showResearch)}
            style={{
              ...buttonStyle(),
              background: "#2a2a30",
              color: COLORS.text,
            }}
          >
            {showResearch ? "Hide Research" : "Research"}
          </button>
          <button
            onClick={() => setShowLua(!showLua)}
            style={{
              ...buttonStyle(),
              background: "#2a2a30",
              color: COLORS.text,
            }}
          >
            {showLua ? "Hide Lua" : "Lua"}
          </button>
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            style={{
              ...buttonStyle(),
              background: showTimeline ? COLORS.accent : "#2a2a30",
              color: showTimeline ? "#000" : COLORS.text,
            }}
          >
            {showTimeline ? "Grid" : "Timeline"}
          </button>
          <BackendHealth />
        </div>
      </div>

      {/* Transport Controls */}
      <TransportControls
        isPlaying={transport.isPlaying}
        bpm={transport.bpm}
        currentBeat={transport.currentBeat}
        onPlay={transport.play}
        onPause={transport.pause}
        onStop={transport.stop}
        onBpmChange={transport.setBpm}
      />

      {/* Main Content */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flex: 1,
          overflow: "hidden",
          marginTop: 12,
        }}
      >
        {/* Left Panel */}
        <div
          style={{
            flex: showLua || showResearch || showProjects ? 2 : 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {/* Brief Input */}
          <div style={panelStyle}>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe your groove... (e.g. 142 BPM dark rolling acid bassline, ritual tension, swung 16ths)"
              style={{
                width: "100%",
                height: 70,
                padding: 12,
                fontSize: 14,
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                resize: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
              disabled={isLoading}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => sendBrief()}
                disabled={isLoading || !brief.trim()}
                style={buttonStyle(isLoading || !brief.trim())}
              >
                {isLoading ? "Generating..." : "Send Brief"}
              </button>
              <button
                onClick={doResearch}
                disabled={isLoading || !brief.trim()}
                style={{
                  ...buttonStyle(isLoading || !brief.trim()),
                  background: "#2a2a30",
                  color: COLORS.text,
                }}
              >
                🔍 Research
              </button>
              <button
                onClick={async () => {
                  setIsLoading(true);
                  setStatus("Melody agent generating...");
                  try {
                    const data = await invoke<Record<string, unknown>>("send_agent_request", {
                      endpoint: "agents/melody",
                      body: {
                        brief: brief || "Generate a melody",
                        session_context: {},
                      },
                    });
                    if (data.clip_preview) {
                      setClips((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          name: "Melody",
                          duration: 2,
                          color: "#5a2a5a",
                          midiData: data.clip_preview as Clip["midiData"],
                        },
                      ]);
                    }
                    setStatus("Melody agent done");
                  } catch (err) {
                    setStatus(`Melody error: ${String(err)}`);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                style={{
                  ...buttonStyle(isLoading),
                  background: "#2a2a50",
                  color: COLORS.text,
                }}
              >
                🎵 Melody
              </button>
              <button
                onClick={async () => {
                  setIsLoading(true);
                  setStatus("Harmony agent generating...");
                  try {
                    const data = await invoke<Record<string, unknown>>("send_agent_request", {
                      endpoint: "agents/harmony",
                      body: {
                        brief: brief || "Generate chords",
                        session_context: {},
                      },
                    });
                    if (data.clip_preview) {
                      setClips((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          name: "Chords",
                          duration: 2,
                          color: "#2a2a5a",
                          midiData: data.clip_preview as Clip["midiData"],
                        },
                      ]);
                    }
                    setStatus("Harmony agent done");
                  } catch (err) {
                    setStatus(`Harmony error: ${String(err)}`);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                style={{
                  ...buttonStyle(isLoading),
                  background: "#2a2a50",
                  color: COLORS.text,
                }}
              >
                🎹 Harmony
              </button>
              <button
                onClick={async () => {
                  setIsLoading(true);
                  setStatus("Arrangement agent generating...");
                  try {
                    const data = await invoke<Record<string, unknown>>("send_agent_request", {
                      endpoint: "agents/arrangement",
                      body: {
                        clips: clips.map((c) => ({ id: c.id, name: c.name, duration: c.duration })),
                        brief: brief || "Arrange my clips",
                        structure: "intro-build-drop-outro",
                        energy_curve: "rise-fall",
                        bpm: transport.bpm,
                      },
                    });
                    if (data.arrangement) {
                      setStatus(`Arrangement: ${(data.arrangement as Record<string, unknown>).total_beats} beats`);
                    } else {
                      setStatus("Arrangement complete");
                    }
                  } catch (err) {
                    setStatus(`Arrangement error: ${String(err)}`);
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading || clips.length === 0}
                style={{
                  ...buttonStyle(isLoading || clips.length === 0),
                  background: "#2a2a50",
                  color: COLORS.text,
                }}
              >
                🎼 Arrange
              </button>
              <button
                onClick={() => setShowPatternEditor(!showPatternEditor)}
                style={{
                  ...buttonStyle(),
                  background: showPatternEditor ? "#5a2a2a" : "#2a2a30",
                  color: COLORS.text,
                }}
              >
                🥁 Drums
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 13,
                  background: COLORS.bg,
                  color: COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                }}
              />
              <button
                onClick={handleSaveProject}
                style={{
                  ...buttonStyle(),
                  padding: "6px 14px",
                  fontSize: 12,
                }}
              >
                💾 Save
              </button>
              <button
                onClick={handleExportMidi}
                disabled={clips.length === 0}
                style={{
                  ...buttonStyle(clips.length === 0),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#2a5a3a",
                }}
              >
                🎵 Export MIDI
              </button>
            </div>
          </div>

          {/* Status */}
          <div
            style={{
              ...panelStyle,
              padding: "10px 14px",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isLoading ? COLORS.warning : COLORS.success,
              }}
            />
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>
              {status}
            </span>
          </div>

          {/* Pattern Editor */}
          {showPatternEditor && (
            <PatternEditor
              isPlaying={transport.isPlaying}
              currentBeat={transport.currentBeat}
              onPatternChange={setDrumPattern}
            />
          )}

          {/* MIDI I/O */}
          <MidiIoPanel
            onStatus={setStatus}
            onNote={(note) => {
              // Add incoming MIDI note as a clip
              setClips((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  name: `MIDI ${note.pitch}`,
                  duration: 0.5,
                  color: "#5a3a2a",
                  midiData: { notes: [note] },
                },
              ]);
            }}
          />

          {streamLog.length > 0 && (
            <div
              style={{
                ...panelStyle,
                maxHeight: 120,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              <div
                style={{
                  color: COLORS.textMuted,
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                Agent Reasoning
              </div>
              {streamLog.map((line, i) => (
                <div key={i} style={{ marginBottom: 3, color: COLORS.text }}>
                  • {line}
                </div>
              ))}
            </div>
          )}

          {/* Clip Grid / Timeline */}
          <div
            style={{
              ...panelStyle,
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {showTimeline ? (
              <Timeline
                isPlaying={transport.isPlaying}
                currentBeat={transport.currentBeat}
                onPlayClip={(id) => {
                  const clip = clips.find((c) => c.id === id);
                  if (clip) playClip(clip);
                }}
              />
            ) : (
              <div style={{ flex: 1, overflow: "auto" }}>
                <SessionViewGrid
                  clips={clips}
                  onPlayClip={(id) => {
                    const clip = clips.find((c) => c.id === id);
                    if (clip) playClip(clip);
                  }}
                  onAccept={acceptClip}
                  onReject={rejectClip}
                  onVariations={generateVariations}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Projects */}
        {showProjects && (
          <div
            style={{
              ...panelStyle,
              width: 240,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <h3
              style={{ margin: "0 0 10px", fontSize: 14, color: COLORS.accent }}
            >
              Saved Projects
            </h3>
            <div style={{ flex: 1, overflow: "auto" }}>
              {savedProjects.length === 0 && (
                <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  No saved projects yet.
                </div>
              )}
              {savedProjects.map((name) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 4,
                    marginBottom: 4,
                    background:
                      name === projectName ? "#2a2a30" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    onClick={() => handleLoadProject(name)}
                    style={{ flex: 1, fontSize: 13, color: COLORS.text }}
                  >
                    {name}
                  </span>
                  <button
                    onClick={() => handleDeleteProject(name)}
                    style={{
                      padding: "2px 6px",
                      fontSize: 11,
                      background: "transparent",
                      border: "none",
                      color: COLORS.error,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right Panel — Research */}
        {showResearch && (
          <div
            style={{
              ...panelStyle,
              width: 320,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <h3
              style={{ margin: "0 0 10px", fontSize: 14, color: COLORS.accent }}
            >
              Baker Street Research
            </h3>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 10,
                background: COLORS.bg,
                borderRadius: 6,
                fontSize: 11,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                color: COLORS.text,
                lineHeight: 1.4,
              }}
            >
              {researchResult ||
                "Click 'Research' to query Baker Street for music knowledge."}
            </pre>
          </div>
        )}

        {/* Right Panel — Lua */}
        {showLua && (
          <div
            style={{
              ...panelStyle,
              width: 320,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3
              style={{ margin: "0 0 10px", fontSize: 14, color: COLORS.accent }}
            >
              Lua Script Editor
            </h3>
            <textarea
              value={luaScript}
              onChange={(e) => setLuaScript(e.target.value)}
              style={{
                flex: 1,
                fontFamily: "monospace",
                fontSize: 12,
                padding: 10,
                background: COLORS.bg,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                resize: "none",
                boxSizing: "border-box",
              }}
              spellCheck={false}
            />
            <button
              onClick={runLua}
              style={{ ...buttonStyle(), marginTop: 10, width: "100%" }}
            >
              Run Script
            </button>
            {luaResult && (
              <pre
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: COLORS.bg,
                  borderRadius: 6,
                  fontSize: 11,
                  maxHeight: 150,
                  overflow: "auto",
                  color: COLORS.text,
                }}
              >
                {luaResult}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: COLORS.textMuted,
          display: "flex",
          gap: 16,
        }}
      >
        <span>Backend: 9876</span>
        <span>Ollama: 11434</span>
        <span>Baker Street: 3001</span>
        <span style={{ marginLeft: "auto" }}>Beehive Studio v0.1.0</span>
      </div>
    </div>
  );
}

export default App;
