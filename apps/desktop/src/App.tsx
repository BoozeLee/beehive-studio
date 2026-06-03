import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionViewGrid } from "./components/SessionView/SessionViewGrid";
import { BackendHealth } from "./components/BackendHealth";
import { TransportControls } from "./components/TransportControls";
import { useTransport, ScheduledClip } from "./lib/webAudioTransport";
import { saveProject, loadProject, listProjects, deleteProject } from "./lib/db";
import { MidiIoPanel } from "./components/MidiIoPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { useTimelineStore } from "./lib/timelineStore";
import { PatternEditor } from "./components/PatternEditor/PatternEditor";
import type { PatternState } from "./components/PatternEditor/PatternEditor";
import { exportProjectAudio, exportTrackStems } from "./lib/audioEngine";
import { SampleBrowser } from "./components/SampleBrowser/SampleBrowser";
import { SampleCuratorDialog } from "./components/SampleCuratorDialog";
import { EffectsChain } from "./components/Mixer/EffectsChain";
import type { EffectInstance } from "./lib/effectEngine";
import { AutomationLaneView } from "./components/Timeline/AutomationLane";
import { Mixer } from "./components/Mixer/Mixer";
import { type AutomationLane, applyAutomationAtBeat } from "./lib/automationEngine";
import { BranchSelector } from "./components/BranchSelector";
import { ProjectPanel } from "./components/ProjectPanel";
import { saveSnapshot, ensureProjectInit, forkSession, readClips } from "./lib/projectGit";
import { useUndoRedoStore } from "./lib/undoRedoStore";
import { ReasoningTrace, useStreamingReasoning } from "./components/ReasoningTrace";
import { OrchestrationPanel } from "./components/OrchestrationPanel";
import { SynthPatchPanel } from "./components/SynthPatchPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
  const [showOrchestrate, setShowOrchestrate] = useState(false);
  const { steps: reasoningSteps, addStep, appendReasoning, complete: completeReasoning, clear: clearReasoning } = useStreamingReasoning();
  const [luaScript, setLuaScript] = useState(
    `-- Beehive Studio Lua Script\n-- Generate music events programmatically\nlocal events = {}\nfor i = 1, 8 do\n  local on, off = music.play_note{\n    pitch = 36 + i,\n    velocity = 100,\n    duration = 0.25,\n    time = i * 0.25,\n    channel = 0\n  }\n  table.insert(events, on)\n  table.insert(events, off)\nend\nreturn {\n  name = "Generated Pattern",\n  events = events,\n  count = #events\n}\n`
  );
  const [luaResult, setLuaResult] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [exportFormat, setExportFormat] = useState<"wav" | "flac" | "mp3">("wav");
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const transport = useTransport();
  const [showTimeline, setShowTimeline] = useState(false);
  const timelineStore = useTimelineStore();
  const undoRedoStore = useUndoRedoStore();
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [_, setDrumPattern] = useState<PatternState | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [showSampleCurator, setShowSampleCurator] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [selectedTrackEffects, setSelectedTrackEffects] = useState<EffectInstance[]>([]);
  const [showMixer, setShowMixer] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [showSynthPatch, setShowSynthPatch] = useState(false);
  const [automationLanes, setAutomationLanes] = useState<AutomationLane[]>([]);

  // Load saved projects on mount
  useEffect(() => {
    listProjects().then(setSavedProjects).catch(() => {});
  }, []);

  // Wire automation lanes to transport
  useEffect(() => {
    const callback =
      automationLanes.length > 0
        ? (currentBeat: number, _audioTime: number) => {
            applyAutomationAtBeat(automationLanes, currentBeat, _audioTime);
          }
        : null;
    transport.setAutomationCallback(callback);
    return () => transport.setAutomationCallback(null);
  }, [automationLanes, transport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Space: play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (transport.isPlaying) {
          transport.pause();
        } else {
          transport.play();
        }
      }

       // Left/Right arrow: nudge playhead
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        // transport doesn't have setBeat, we'll need to implement this differently
        // For now, we'll skip this shortcut
      }

       // Up/Down arrow: change zoom
      if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && !e.shiftKey) {
        e.preventDefault();
        const zoomFactor = e.code === 'ArrowUp' ? 1.2 : 0.8;
        timelineStore.setZoom(timelineStore.zoom * zoomFactor);
      }

      // Delete/Backspace: delete selected clip
      if ((e.code === 'Delete' || e.code === 'Backspace') && timelineStore.selectedClipId) {
        e.preventDefault();
        handleDeleteClip(timelineStore.selectedClipId);
      }

      // Ctrl+Z: undo
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        handleUndo();
      }

      // Ctrl+Y or Ctrl+Shift+Z: redo
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) {
        e.preventDefault();
        handleRedo();
      }

      // Ctrl+S: save project
      if (e.ctrlKey && e.code === 'KeyS') {
        e.preventDefault();
        handleSaveProject();
      }

      // Ctrl+O: open project picker
      if (e.ctrlKey && e.code === 'KeyO') {
        e.preventDefault();
        setShowProjects(true);
      }

      // Ctrl+N: new project
      if (e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        handleNewProject();
      }

      // Ctrl+F: fork project
      if (e.ctrlKey && e.code === 'KeyF') {
        e.preventDefault();
        handleFork();
      }

      // Ctrl+Shift+S: save as
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        // Implementation would show a save-as dialog
        // For now, just prompt for name
        const name = prompt("Save project as:", projectName);
        if (name && name !== projectName) {
          setProjectName(name);
          handleSaveProject();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transport, timelineStore.selectedClipId]);

  // Sync clips to timeline store
  useEffect(() => {
    if (!showTimeline || clips.length === 0) return;
    const clipMap: Record<string, Clip> = {};
    for (const clip of clips) {
      clipMap[clip.id] = clip as unknown as Clip;
    }
    timelineStore.setClips(clipMap as never);

    const { tracks } = useTimelineStore.getState();
    if (tracks.length === 0) {
      const trackId = crypto.randomUUID();
      timelineStore.addTrack({
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
      clearReasoning();
      addStep({ type: "status", text: variationBrief ? "Generating variation..." : "Agent thinking..." });
      setStatus(
        variationBrief ? "Generating variation..." : "Agent thinking..."
      );
  
      // Save current state to history before making changes
      const { tracks, clips: existingClips, selectedTrackId, selectedClipId, cursorPosition, zoom, scrollOffset, snapToGrid, gridDivision } = timelineStore;
      undoRedoStore.push({
        tracks,
        clips: existingClips,
        selectedTrackId,
        selectedClipId,
        cursorPosition,
        zoom,
        scrollOffset,
        snapToGrid,
        gridDivision,
        setTracks: () => {},
        addTrack: () => {},
        updateTrack: () => {},
        removeTrack: () => {},
        setClips: () => {},
        addClip: () => {},
        updateClip: () => {},
        removeClip: () => {},
        selectTrack: () => {},
        selectClip: () => {},
        setCursorPosition: () => {},
        setZoom: () => {},
        setScrollOffset: () => {},
        setSnapToGrid: () => {},
      });
  
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
  
       if (data.reasoning && data.reasoning.length > 0) {
         for (const r of data.reasoning) {
           appendReasoning(r);
         }
       }
  
       const newClip: Clip = {
         id: data.task_id || crypto.randomUUID(),
         name: text.slice(0, 40) + (text.length > 40 ? "..." : ""),
         midiData: data.clip_preview,
         reasoning: data.reasoning,
       };
  
       setClips((prev) => [...prev, newClip]);
       if (!variationBrief) setBrief("");
       addStep({ type: "complete", text: "Clip generated successfully" });
       setStatus(
         variationBrief
           ? "Variation ready"
           : "Clip generated — click Play"
       );
       completeReasoning();
     } catch (err) {
       console.error(err);
       addStep({ type: "error", text: `Backend error: ${String(err)}` });
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
// Save current state to history before saving
        const { tracks: t2, clips: c2, selectedTrackId: st2, selectedClipId: sc2, cursorPosition: cp2, zoom: z2, scrollOffset: so2, snapToGrid: sg2, gridDivision: gd2 } = timelineStore;
        undoRedoStore.push({
          tracks: t2,
          clips: c2,
          selectedTrackId: st2,
          selectedClipId: sc2,
          cursorPosition: cp2,
          zoom: z2,
          scrollOffset: so2,
          snapToGrid: sg2,
          gridDivision: gd2,
          setTracks: () => {},
          addTrack: () => {},
          updateTrack: () => {},
          removeTrack: () => {},
          setClips: () => {},
          addClip: () => {},
          updateClip: () => {},
          removeClip: () => {},
          selectTrack: () => {},
          selectClip: () => {},
          setCursorPosition: () => {},
          setZoom: () => {},
          setScrollOffset: () => {},
          setSnapToGrid: () => {},
        });
 
       await saveProject(projectName, clips);
       const clipJson = JSON.stringify(clips);
       await ensureProjectInit(projectName);
       const hash = await saveSnapshot(
         projectName,
         clipJson,
         `Save: ${projectName}`,
       );
       const projects = await listProjects();
       setSavedProjects(projects);
       const tag =
         hash !== "No changes to commit"
           ? `commit ${hash.slice(0, 7)}`
           : "no changes";
       setStatus(`✓ Saved "${projectName}" (${clips.length} clips, ${tag})`);
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

  async function handleFork() {
    if (clips.length === 0) {
      setStatus("Nothing to fork — generate some clips first");
      return;
    }
    const branchName = prompt("Fork branch name:", "experiment");
    if (!branchName) return;
    try {
      const clipJson = JSON.stringify(clips);
      await ensureProjectInit(projectName);
      const result = await forkSession(
        projectName,
        branchName,
        clipJson,
        `Fork: ${projectName} → ${branchName}`,
      );
      setStatus(`✓ Forked to '${branchName}' (${result.slice(0, 7)})`);
    } catch (err) {
      setStatus(`Fork failed: ${String(err)}`);
    }
  }

  async function handleBranchSwitch(_branch: string) {
    try {
      const raw = await readClips(projectName);
      const loaded: Clip[] = JSON.parse(raw);
      if (Array.isArray(loaded) && loaded.length > 0) {
        setClips(loaded);
      }
    } catch {}
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

  async function handleDeleteClip(clipId: string) {
    try {
      setClips(prev => prev.filter(clip => clip.id !== clipId));
      setStatus(`🗑️ Deleted clip`);
    } catch (err) {
      setStatus(`Delete failed: ${String(err)}`);
    }
  }

  async function handleUndo() {
    try {
      const prev = undoRedoStore.undo();
      if (prev.clips) {
        const clipArray = Object.values(prev.clips) as unknown as Clip[];
        if (clipArray.length > 0) {
          setClips(clipArray);
        }
      }
      setStatus("↶ Undo");
    } catch {
      setStatus("Nothing to undo");
    }
  }

  async function handleRedo() {
    try {
      const next = undoRedoStore.redo();
      if (next.clips) {
        const clipArray = Object.values(next.clips) as unknown as Clip[];
        if (clipArray.length > 0) {
          setClips(clipArray);
        }
      }
      setStatus("↷ Redo");
    } catch {
      setStatus("Nothing to redo");
    }
  }

  async function handleNewProject() {
    try {
      setClips([]);
      setProjectName("Untitled Project");
      setStatus("📄 New project created");
    } catch (err) {
      setStatus(`New project failed: ${String(err)}`);
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

  async function handleExportAudio() {
    if (clips.length === 0) {
      setStatus("Nothing to export — generate some clips first");
      return;
    }
    setStatus("Rendering audio...");
    try {
      const renderClips = clips.map((c) => ({
        id: c.id,
        notes: c.midiData?.notes ?? [],
        channel: 0,
      }));
      const audioData = await exportProjectAudio(renderClips, transport.bpm, exportFormat);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const ext = exportFormat;
      const savePath = await save({
        defaultPath: `${projectName.replace(/\s+/g, "-").toLowerCase()}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (savePath) {
        await invoke("write_file_bytes", {
          path: savePath,
          data: Array.from(audioData),
        });
        setStatus(`✓ Audio exported to ${savePath}`);
      } else {
        setStatus("Export cancelled");
      }
    } catch (err) {
      setStatus(`Audio export failed: ${String(err)}`);
    }
  }

  async function handleExportStems() {
    if (clips.length === 0) {
      setStatus("Nothing to export — generate some clips first");
      return;
    }
    setStatus("Rendering stems...");
    try {
      // Group clips by name pattern (unique stems from individual clips)
      const stemsData = clips.map((clip) => ({
        id: clip.id,
        name: clip.name || `clip-${clip.id.slice(0, 6)}`,
        clips: [{ id: clip.id, notes: clip.midiData?.notes ?? [] }],
      }));

      const stems = await exportTrackStems(stemsData, transport.bpm, exportFormat);

      // Save each stem to a directory
      const { save } = await import("@tauri-apps/plugin-dialog");
      for (const stem of stems) {
        const ext = exportFormat;
        const savePath = await save({
          defaultPath: `${projectName.replace(/\s+/g, "-").toLowerCase()}_${stem.name.replace(/\s+/g, "_")}.${ext}`,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        });
        if (savePath) {
          await invoke("write_file_bytes", {
            path: savePath,
            data: Array.from(stem.data),
          });
        }
      }
      setStatus(`✓ ${stems.length} stems exported`);
    } catch (err) {
      setStatus(`Stem export failed: ${String(err)}`);
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
    <ErrorBoundary>
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
              <button
                onClick={() => setShowSamples(!showSamples)}
                style={{
                  ...buttonStyle(),
                  background: showSamples ? COLORS.accent : "#2a2a30",
                  color: showSamples ? "#000" : COLORS.text,
                }}
              >
                {showSamples ? "Hide Samples" : "Samples"}
              </button>
              <button
                onClick={() => setShowSampleCurator(!showSampleCurator)}
                style={{
                  ...buttonStyle(),
                  background: showSampleCurator ? COLORS.accent : "#2a2a30",
                  color: showSampleCurator ? "#000" : COLORS.text,
                }}
              >
                {showSampleCurator ? "Hide Curator" : "Curator"}
              </button>
              <button
                onClick={() => setShowEffects(!showEffects)}
                style={{
                  ...buttonStyle(),
                  background: showEffects ? COLORS.accent : "#2a2a30",
                  color: showEffects ? "#000" : COLORS.text,
                }}
              >
                {showEffects ? "Hide FX" : "FX"}
              </button>
              <button
                onClick={() => setShowMixer(!showMixer)}
                style={{
                  ...buttonStyle(),
                  background: showMixer ? COLORS.accent : "#2a2a30",
                  color: showMixer ? "#000" : COLORS.text,
                }}
              >
                {showMixer ? "Hide Mixer" : "Mixer"}
              </button>
              <button
                onClick={() => setShowGit(!showGit)}
                style={{
                  ...buttonStyle(),
                  background: showGit ? COLORS.accent : "#2a2a30",
                  color: showGit ? "#000" : COLORS.text,
                }}
              >
                {showGit ? "Hide Git" : "Git"}
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
              <button
                onClick={() => setShowOrchestrate(!showOrchestrate)}
                style={{
                  ...buttonStyle(),
                  background: showOrchestrate ? "#2a4a2a" : "#2a2a30",
                  color: COLORS.text,
                }}
              >
                🎼 Orchestrate
              </button>
              <button
                onClick={() => setShowSynthPatch(!showSynthPatch)}
                style={{
                  ...buttonStyle(),
                  background: showSynthPatch ? "#4a2a4a" : "#2a2a30",
                  color: COLORS.text,
                }}
              >
                🎛 Synth
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
              <BranchSelector projectName={projectName} onBranchChange={handleBranchSwitch} />
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
                onClick={handleFork}
                disabled={clips.length === 0}
                style={{
                  ...buttonStyle(clips.length === 0),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#5a2a5a",
                }}
              >
                🪝 Fork
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
              <button
                onClick={handleExportAudio}
                disabled={clips.length === 0}
                style={{
                  ...buttonStyle(clips.length === 0),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#5a2a5a",
                }}
              >
                🔊 Export Audio
              </button>
              <button
                onClick={handleExportStems}
                disabled={clips.length === 0}
                style={{
                  ...buttonStyle(clips.length === 0),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#3a2a5a",
                }}
              >
                🎚 Export Stems
              </button>
              <button
                onClick={() => setExportFormat(f => f === "wav" ? "flac" : f === "flac" ? "mp3" : "wav")}
                title="Toggle export format (cycles: WAV → FLAC → MP3)"
                style={{
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  background: exportFormat === "flac" ? "#8b5cf6" : exportFormat === "mp3" ? "#f59e0b" : "#2a2a30",
                  border: "1px solid #3a3a40",
                  borderRadius: 4,
                  color: "#ccc",
                  cursor: "pointer",
                }}
              >
                .{exportFormat}
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

          {/* Orchestration Panel */}
          {showOrchestrate && (
            <OrchestrationPanel
              brief={brief}
              clips={clips}
              bpm={transport.bpm}
              onStatus={setStatus}
              onClipGenerated={(clip) => {
                setClips((prev) => [...prev, clip]);
              }}
              reasoningHook={{ steps: reasoningSteps, addStep, appendReasoning, complete: completeReasoning, clear: clearReasoning }}
            />
          )}

          {/* Synth Patch Designer */}
          {showSynthPatch && <SynthPatchPanel />}

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

          {showSamples && (
            <SampleBrowser
              onSampleSelect={(_path, info) => {
                setClips((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: info.filename.replace(/\.[^.]+$/, ""),
                    duration: info.duration_secs > 0 ? info.duration_secs * (transport.bpm / 60) : 2,
                    color: "#3a5a2a",
                  },
                ]);
                setStatus(`Sample loaded: ${info.filename}`);
              }}
            />
          )}

          {showSampleCurator && (
            <SampleCuratorDialog
              onImportSample={(_path, name) => {
                setClips((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name,
                    duration: 2,
                    color: "#5a2a3a",
                  },
                ]);
                setStatus(`Sample imported: ${name}`);
              }}
            />
          )}

          {showEffects && (
            <EffectsChain
              effects={selectedTrackEffects}
              onChange={setSelectedTrackEffects}
            />
          )}

          {showMixer && <Mixer />}

          {automationLanes.length > 0 &&
            automationLanes.map((lane) => (
              <AutomationLaneView
                key={lane.id}
                lane={lane}
                totalBeats={16}
                zoom={16}
                isPlaying={transport.isPlaying}
                currentBeat={transport.currentBeat}
                onAddPoint={(time: number, value: number) => {
                  setAutomationLanes((prev) =>
                    prev.map((l) =>
                      l.id === lane.id
                        ? {
                            ...l,
                            points: [
                              ...l.points,
                              { time, value },
                            ].sort((a, b) => a.time - b.time),
                          }
                        : l
                    )
                  );
                }}
                onRemovePoint={(time: number) => {
                  setAutomationLanes((prev) =>
                    prev.map((l) =>
                      l.id === lane.id
                        ? {
                            ...l,
                            points: l.points.filter(
                              (p) => Math.abs(p.time - time) >= 0.01
                            ),
                          }
                        : l
                    )
                  );
                }}
              />
            ))}

          {reasoningSteps.length > 0 && (
            <ReasoningTrace
              steps={reasoningSteps}
              title="Agent Reasoning"
              maxHeight={180}
            />
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

        {/* Right Panel — Git */}
        {showGit && (
          <ProjectPanel
            projectName={projectName}
            visible={showGit}
            onClose={() => setShowGit(false)}
            onBranchSwitch={handleBranchSwitch}
          />
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
        <span style={{ marginLeft: "auto" }}>Beehive Studio v1.0.0-rc.0</span>
      </div>
    </div>
    </ErrorBoundary>
  );
}

export default App;
