import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { SessionViewGrid } from "./components/SessionView/SessionViewGrid";
import { BackendHealth } from "./components/BackendHealth";
import { TransportControls } from "./components/TransportControls";
import { useTransport, ScheduledClip } from "./lib/transport";
import { saveProject, loadProject, listProjects, deleteProject } from "./lib/db";
import { MidiIoPanel } from "./components/MidiIoPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { useTimelineStore } from "./lib/timelineStore";
import { PatternEditor } from "./components/PatternEditor/PatternEditor";
import type { QaResult } from "./components/PatternEditor/PatternEditor";
import { PianoRoll } from "./components/PianoRoll/PianoRoll";
import { exportProjectAudio } from "./lib/audioEngine";
import { ExportAudioDialog } from "./components/ExportAudioDialog";
import { summarizeRender, type RenderPreset } from "./lib/exportWorkflow";
import {
  initMixer,
  createChannel,
  getMasterState,
  removeChannel,
  setMasterGain,
  updateChannel,
} from "./lib/audioMixer";
import { SampleBrowser } from "./components/SampleBrowser/SampleBrowser";
import { EffectsChain } from "./components/Mixer/EffectsChain";
import { AutomationLaneView } from "./components/Timeline/AutomationLane";
import { Mixer } from "./components/Mixer/Mixer";
import {
  addAutomationPoint,
  automationValuesAtBeat,
  createAutomationLane,
  removeAutomationPoint,
  type AutomationLane,
} from "./lib/automationEngine";
import { BranchSelector } from "./components/BranchSelector";
import { ProjectPanel } from "./components/ProjectPanel";
import { saveSnapshot, ensureProjectInit, forkSession, readClips } from "./lib/projectGit";
import {
  assignClipIdsToTracks,
  findTrackIdForClip,
  normalizeTimelineClip,
} from "./lib/timelineClipAdapter";
import type { Clip as TimelineClip, Track } from "../../../packages/core-models/index";
import {
  buildArrangementMidiPayload,
  buildArrangementPlaybackClips,
  buildArrangementRenderPayload,
  parseProjectDocument,
  serializeProjectDocument,
  type ProjectDocumentV4,
} from "./lib/arrangementAdapter";
import {
  createDefaultPattern,
  resolvePatternTargetTrack,
  usePatternBankStore,
} from "./lib/patternBankStore";
import { consolidateProjectAssets, resolveProjectAsset } from "./lib/projectAssets";
import { cancelRenderJob, createRenderJob, waitForRenderJob } from "./lib/renderJobs";

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
  qa?: { pass?: boolean; score?: number; warnings?: string[] };
  sourcePatternId?: string;
  audioFilePath?: string;
  audioSourceOffset?: number;
  audioSourceDuration?: number;
  gain?: number;
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
  const {
    tracks: timelineTracks,
    clips: timelineClips,
    selectedTrackId,
    selectedClipId,
    setClips: setTimelineClips,
    setTracks: setTimelineTracks,
    addTrack,
    addClip: addTimelineClip,
    removeTrack,
    updateTrack,
    updateClipMidiNotes,
  } = useTimelineStore();
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const {
    patterns,
    selectedPatternId,
    setPatterns,
    addPattern,
    updatePattern,
    duplicatePattern,
    removePattern,
    selectPattern,
  } = usePatternBankStore();
  const [showSamples, setShowSamples] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [renderPreset, setRenderPreset] = useState<RenderPreset>("festival");
  const [renderEngine, setRenderEngine] = useState<"python" | "desktop">("python");
  const [renderOutputMode, setRenderOutputMode] = useState<"master" | "master_and_stems">("master");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [activeRenderJobId, setActiveRenderJobId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState({ progress: 0, label: "Preparing" });
  const selectedPattern = patterns.find((pattern) => pattern.id === selectedPatternId) ?? null;
  const selectedTimelineClip = selectedClipId ? timelineClips[selectedClipId] : undefined;
  const selectedTimelineTrack = timelineTracks.find((track) => track.id === selectedTrackId);
  const selectedTrackEffects = selectedTimelineTrack?.effects ?? [];
  const automationLanes: AutomationLane[] = (selectedTimelineTrack?.automationLanes ?? []).map(
    (lane) => ({
      ...lane,
      trackId: selectedTimelineTrack?.id ?? "",
      mode: lane.mode ?? "read",
    })
  );
  const exportPayload = useMemo(
    () =>
      buildArrangementRenderPayload(
        timelineTracks,
        timelineClips as Record<string, TimelineClip>
      ),
    [timelineClips, timelineTracks]
  );
  const exportSummary = useMemo(
    () => summarizeRender(exportPayload.renderClips, transport.bpm),
    [exportPayload.renderClips, transport.bpm]
  );

  const restoreProjectDocument = useCallback(
    (document: ProjectDocumentV4) => {
      const currentTracks = useTimelineStore.getState().tracks;
      for (const track of currentTracks) removeChannel(track.id);

      setClips(document.clips);
      setTimelineTracks(document.timeline.tracks);
      setTimelineClips(document.timeline.clips as never);
      setPatterns(document.patterns);
      setRenderEngine(document.settings.renderEngine);
      setMasterGain(document.settings.masterGain);
      for (const track of document.timeline.tracks) {
        createChannel(track.id, track.name);
      }
    },
    [setPatterns, setTimelineClips, setTimelineTracks]
  );

  const currentProjectDocumentJson = useCallback(() => {
    const timeline = useTimelineStore.getState();
    return serializeProjectDocument(
      clips,
      timeline.tracks,
      timeline.clips as Record<string, TimelineClip>,
      patterns,
      { masterGain: getMasterState().gain, renderEngine }
    );
  }, [clips, patterns, renderEngine]);

  const playArrangement = useCallback(async () => {
    const { tracks, clips: timelineClips } = useTimelineStore.getState();
    const scheduled = buildArrangementPlaybackClips(tracks, timelineClips as Record<string, TimelineClip>);
    if (scheduled.length === 0) {
      setStatus("Nothing in arrangement to play");
      return;
    }

    setStatus("Playing arrangement...");
    transport.clearAll();
    for (const clip of scheduled) {
      const audioFilePath = clip.audioFilePath
        ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
        : undefined;
      transport.scheduleClip({ ...clip, audioFilePath });
    }
    transport.seek(0);
    await transport.play();
  }, [projectName, transport]);

  const handleConsolidateProject = useCallback(async () => {
    try {
      await ensureProjectInit(projectName);
      const timeline = useTimelineStore.getState();
      const result = await consolidateProjectAssets(
        projectName,
        timeline.clips as Record<string, TimelineClip>
      );
      setTimelineClips(result.clips as never);
      setClips((prev) =>
        prev.map((clip) => ({
          ...clip,
          audioFilePath: result.clips[clip.id]?.audioFilePath ?? clip.audioFilePath,
        }))
      );
      setStatus(result.count > 0 ? `Consolidated ${result.count} sample assets` : "Project already consolidated");
    } catch (err) {
      setStatus(`Consolidation failed: ${String(err)}`);
    }
  }, [projectName, setTimelineClips]);

  const handleTransportPlay = useCallback(() => {
    if (showTimeline) {
      void playArrangement();
    } else {
      void transport.play();
    }
  }, [playArrangement, showTimeline, transport]);

  // Load saved projects on mount
  useEffect(() => {
    listProjects().then(setSavedProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (showPatternEditor && patterns.length === 0) {
      addPattern(createDefaultPattern());
    }
  }, [addPattern, patterns.length, showPatternEditor]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (transport.isPlaying) transport.pause();
        else handleTransportPlay();
      } else if (e.key === "s" && e.ctrlKey) {
        e.preventDefault();
        handleSaveProject();
      } else if (e.key === "e" && e.ctrlKey) {
        e.preventDefault();
        setShowExportDialog(true);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedClipId, selectedTrackId, removeClip, removeTrack } = useTimelineStore.getState();
        if (selectedClipId) {
          removeClip(selectedClipId);
          setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
        } else if (selectedTrackId) {
          removeTrack(selectedTrackId);
          removeChannel(selectedTrackId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [transport.isPlaying, transport.pause, handleTransportPlay]);

  // Sync generated/session clips into full timeline clips and assign any new
  // clips to the first track, preserving existing manual track assignments.
  useEffect(() => {
    if (!showTimeline) return;

    const state = useTimelineStore.getState();
    if (clips.length === 0) {
      setTimelineClips({});
      for (const track of state.tracks) {
        if (track.clips.length > 0) updateTrack(track.id, { clips: [] });
      }
      return;
    }

    let tracks = state.tracks;
    let targetTrack = tracks[0];
    if (!targetTrack) {
      targetTrack = {
        id: crypto.randomUUID(),
        name: "Track 1",
        type: "midi",
        color: COLORS.accent,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        arm: false,
        clips: [],
        automationLanes: [],
      };
      addTrack(targetTrack);
      createChannel(targetTrack.id, targetTrack.name);
      tracks = [targetTrack];
    }

    const currentClips = useTimelineStore.getState().clips as Record<string, TimelineClip>;
    const nextClips: Record<string, TimelineClip> = {};
    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      const trackId =
        findTrackIdForClip(tracks, clip.id) ??
        currentClips[clip.id]?.trackId ??
        targetTrack.id;
      nextClips[clip.id] = normalizeTimelineClip(clip, trackId, index, currentClips[clip.id]);
    }

    setTimelineClips(nextClips as never);

    const nextTrackClipIds = assignClipIdsToTracks(
      tracks as Track[],
      clips.map((clip) => clip.id),
      targetTrack.id
    );
    for (const track of tracks) {
      const nextIds = nextTrackClipIds[track.id] ?? [];
      if (
        nextIds.length !== track.clips.length ||
        nextIds.some((clipId, index) => clipId !== track.clips[index])
      ) {
        updateTrack(track.id, { clips: nextIds });
      }
    }
  }, [clips, showTimeline, setTimelineClips, addTrack, updateTrack]);

  // Initialize mixer on mount
  useEffect(() => {
    initMixer();
  }, []);

  // Wire timeline track state to the Web Audio mixer. Timeline and Mixer controls
  // both mutate the timeline store, so this is the single sync point.
  useEffect(() => {
    for (const track of timelineTracks) {
      createChannel(track.id, track.name);
      updateChannel(track.id, {
        muted: track.muted,
        solo: track.solo,
        volume: track.volume,
        pan: track.pan,
        armed: track.arm,
        fxReturns: track.sends,
      });
    }
  }, [timelineTracks]);

  useEffect(() => {
    if (!transport.isPlaying) return;
    for (const track of timelineTracks) {
      const values = automationValuesAtBeat(
        track.automationLanes.map((lane) => ({
          ...lane,
          trackId: track.id,
          mode: lane.mode ?? "read",
        })),
        transport.currentBeat
      );
      updateChannel(track.id, {
        volume: values.volume,
        pan: values.pan,
        fxReturns: {
          ...(values["send.reverb"] !== undefined ? { reverb: values["send.reverb"] } : {}),
          ...(values["send.delay"] !== undefined ? { delay: values["send.delay"] } : {}),
        },
      });
    }
  }, [timelineTracks, transport.currentBeat, transport.isPlaying]);

  const handleAddTrack = useCallback(() => {
    const trackId = crypto.randomUUID();
    const trackNum = useTimelineStore.getState().tracks.length + 1;
    addTrack({
        id: trackId,
        name: `Track ${trackNum}`,
        type: "midi",
        color: COLORS.accent,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        arm: false,
        clips: [],
        automationLanes: [],
    });
    createChannel(trackId, `Track ${trackNum}`);
  }, [addTrack]);

  const handleRemoveTrack = useCallback((trackId: string) => {
    removeTrack(trackId);
    removeChannel(trackId);
  }, [removeTrack]);

  const sendPatternToTimeline = useCallback(
    (
      notes: NonNullable<TimelineClip["midiData"]>["notes"],
      name: string,
      qa?: QaResult
    ) => {
      const state = useTimelineStore.getState();
      let targetTrack = resolvePatternTargetTrack(state.tracks, selectedTrackId);

      if (!targetTrack) {
        targetTrack = {
          id: crypto.randomUUID(),
          name: "Drums",
          type: "midi",
          color: "#ef4444",
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          arm: false,
          clips: [],
          automationLanes: [],
          instrument: { type: "tonejs", preset: "drum" },
        };
        addTrack(targetTrack);
        createChannel(targetTrack.id, targetTrack.name);
      }

      const start = targetTrack.clips.reduce((end, clipId) => {
        const clip = useTimelineStore.getState().clips[clipId];
        return clip ? Math.max(end, clip.start + clip.duration) : end;
      }, 0);
      const duration = Math.max(4, ...notes.map((note) => note.start + note.duration));
      const clipId = crypto.randomUUID();
      const now = Date.now() / 1000;
      const timelineClip: TimelineClip = {
        id: clipId,
        name,
        type: "midi",
        trackId: targetTrack.id,
        start,
        duration,
        loop: false,
        color: "#ef4444",
        midiData: { notes },
        playback: { instrument: "drum" },
        metadata: {
          generative: Boolean(qa),
          confidence: typeof qa?.score === "number" ? qa.score / 100 : undefined,
          sourcePatternId: selectedPattern?.id,
          tags: qa?.warnings?.length ? ["qa-warning"] : [],
        },
        createdAt: now,
        updatedAt: now,
      };
      addTimelineClip(timelineClip);
      setClips((prev) => [
        ...prev,
        {
          id: clipId,
          name,
          duration,
          color: "#ef4444",
          midiData: { notes },
          qa,
          sourcePatternId: selectedPattern?.id,
        },
      ]);
      if (selectedPattern) {
        updatePattern(selectedPattern.id, { sourceClipId: clipId, qa });
      }
      setStatus(`Drum pattern "${name}" sent to ${targetTrack.name}`);
    },
    [addTimelineClip, addTrack, selectedPattern, selectedTrackId, updatePattern]
  );

  const handleSeek = useCallback((beat: number) => {
    transport.seek(beat);
  }, [transport]);

  // Play a single clip using the transport
  const playClip = useCallback(
    async (clip: Clip) => {
      if (!clip.midiData?.notes?.length && !clip.audioFilePath) {
        setStatus("Clip has no playable content");
        return;
      }

      setStatus("Playing clip...");

      const scheduled: ScheduledClip = {
        id: clip.id,
        notes: clip.midiData?.notes ?? [],
        startBeat: 0,
        loop: false,
        channel: 0,
        audioFilePath: clip.audioFilePath
          ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
          : undefined,
        sourceOffset: clip.audioSourceOffset,
        duration: clip.duration,
        gain: clip.gain,
      };

      transport.clearAll();
      transport.scheduleClip(scheduled);
      await transport.play();
    },
    [projectName, transport]
  );

  const launchSessionScene = useCallback(async () => {
    const state = useTimelineStore.getState();
    const scheduled = buildArrangementPlaybackClips(
      state.tracks,
      state.clips as Record<string, TimelineClip>
    );
    const resolved = await Promise.all(
      scheduled.map(async (clip) => ({
        ...clip,
        startBeat: 0,
        audioFilePath: clip.audioFilePath
          ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
          : undefined,
      }))
    );
    await transport.launchScene(resolved);
    setStatus(`Launched scene with ${resolved.length} clips`);
  }, [projectName, transport]);

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
      const projectDocumentJson = currentProjectDocumentJson();
      await saveProject(projectName, projectDocumentJson);
      await ensureProjectInit(projectName);
      const hash = await saveSnapshot(
        projectName,
        projectDocumentJson,
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

  function handleNewProjectWithTemplate() {
    const templateTracks = [
      { name: "Kick", type: "midi" as const, color: "#ef4444", pitch: 36 },
      { name: "Snare", type: "midi" as const, color: "#fbbf24", pitch: 38 },
      { name: "Hi-Hats", type: "midi" as const, color: "#60a5fa", pitch: 42 },
      { name: "Bass", type: "midi" as const, color: "#ff8c42", pitch: 36 },
      { name: "Synth", type: "midi" as const, color: "#a855f7", pitch: 60 },
      { name: "Pad", type: "midi" as const, color: "#06b6d4", pitch: 48 },
    ];

    // Clear existing
    const { tracks } = useTimelineStore.getState();
    for (const t of tracks) {
      removeTrack(t.id);
      removeChannel(t.id);
    }
    setClips([]);
    setTimelineClips({});
    setPatterns([]);

    // Create template tracks
    for (const tt of templateTracks) {
      const trackId = crypto.randomUUID();
      addTrack({
        id: trackId,
        name: tt.name,
        type: tt.type,
        color: tt.color,
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        arm: false,
        clips: [],
        automationLanes: [],
      });
      createChannel(trackId, tt.name);
    }

    setProjectName("Untitled Project");
    setStatus("New project with template created");
  }

  async function handleLoadProject(name: string) {
    try {
      const loaded = await loadProject(name);
      restoreProjectDocument(loaded);
      setProjectName(name);
      setStatus(`✓ Loaded "${name}" (${loaded.clips.length} clips)`);
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
      const projectDocumentJson = currentProjectDocumentJson();
      await ensureProjectInit(projectName);
      const result = await forkSession(
        projectName,
        branchName,
        projectDocumentJson,
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
      const loaded = parseProjectDocument(raw);
      restoreProjectDocument(loaded);
    } catch {}
  }

  async function handleExportMidi() {
    if (clips.length === 0) {
      setStatus("Nothing to export — generate some clips first");
      return;
    }
    setStatus("Exporting MIDI...");
    try {
      const { tracks, clips: timelineClips } = useTimelineStore.getState();
      const midiClips =
        tracks.length > 0
          ? buildArrangementMidiPayload(tracks, timelineClips as Record<string, TimelineClip>)
          : clips.map((c) => ({ ...c, midiData: c.midiData ?? {} }));
      const tempPath = await invoke<string>("export_midi", {
        clips: midiClips,
        bpm: transport.bpm,
        filename: projectName.replace(/\s+/g, "-").toLowerCase(),
      });
      // Use Tauri dialog to let user pick save location
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

  async function handleExportAudio(revealAfterSave = false) {
    if (exportPayload.renderClips.length === 0) {
      setStatus("Nothing audible in arrangement to export");
      return;
    }
    try {
      const savePath = await save({
        defaultPath: `${projectName.replace(/\s+/g, "-").toLowerCase()}-${renderPreset}.wav`,
        filters: [{ name: "WAV", extensions: ["wav"] }],
      });
      if (!savePath) {
        setStatus("Export cancelled");
        return;
      }

      setIsExportingAudio(true);
      setExportProgress({ progress: 0, label: "Preparing arrangement" });
      const resolvedClips = await Promise.all(
        exportPayload.renderClips.map(async (clip) => ({
          ...clip,
          audioFilePath: clip.audioFilePath
            ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
            : undefined,
        }))
      );
      let wavData: Uint8Array;
      let stemSources: string[] = [];
      let usedEngine: "python" | "desktop" = renderEngine;
      if (renderEngine === "python") {
        try {
          setStatus(`Rendering audio with Python HQ (${renderPreset})...`);
          const created = await createRenderJob(
            resolvedClips,
            exportPayload.mixerTracks,
            transport.bpm,
            renderPreset,
            renderOutputMode
          );
          setActiveRenderJobId(created.id);
          const completed = await waitForRenderJob(created.id, (job) =>
            setExportProgress({ progress: job.progress, label: job.stage })
          );
          if (!completed.master_path) throw new Error("Python renderer returned no master");
          wavData = new Uint8Array(await invoke<number[]>("read_file_bytes", { path: completed.master_path }));
          stemSources = completed.stem_paths ?? [];
        } catch (error) {
          usedEngine = "desktop";
          setStatus(`Python renderer unavailable; using desktop fallback: ${String(error)}`);
          wavData = await exportProjectAudio(
            resolvedClips,
            transport.bpm,
            renderPreset,
            exportPayload.mixerTracks,
            setExportProgress
          );
        }
      } else {
        setStatus(`Rendering audio locally (${renderPreset})...`);
        wavData = await exportProjectAudio(
          resolvedClips,
          transport.bpm,
          renderPreset,
          exportPayload.mixerTracks,
          setExportProgress
        );
      }
      await invoke("write_file_bytes", {
        path: savePath,
        data: Array.from(wavData),
      });
      const directory = savePath.replace(/[\\/][^\\/]+$/, "");
      if (renderOutputMode === "master_and_stems") {
        if (stemSources.length > 0) {
          for (const stemPath of stemSources) {
            const filename = stemPath.split(/[\\/]/).pop() ?? "stem.wav";
            const data = await invoke<number[]>("read_file_bytes", { path: stemPath });
            await invoke("write_file_bytes", { path: `${directory}/${filename}`, data });
          }
        } else {
          for (const track of exportPayload.mixerTracks) {
            const trackClips = resolvedClips.filter((clip) => String(clip.channel) === track.id);
            if (trackClips.length === 0) continue;
            const stem = await exportProjectAudio(trackClips, transport.bpm, renderPreset, [track]);
            const filename = `${track.name ?? track.id}`.replace(/[^a-z0-9_-]+/gi, "_");
            await invoke("write_file_bytes", {
              path: `${directory}/${filename}.wav`,
              data: Array.from(stem),
            });
          }
        }
      }
      let revealWarning = "";
      if (revealAfterSave) {
        try {
          await revealItemInDir(savePath);
        } catch {
          revealWarning = " (could not reveal file)";
        }
      }
      setStatus(`✓ Audio exported with ${usedEngine} renderer to ${savePath}${revealWarning}`);
      setShowExportDialog(false);
    } catch (err) {
      setStatus(`Audio export failed: ${String(err)}`);
    } finally {
      setActiveRenderJobId(null);
      setIsExportingAudio(false);
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
        onPlay={handleTransportPlay}
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
                onClick={handleNewProjectWithTemplate}
                style={{
                  ...buttonStyle(),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#2a2a5a",
                }}
              >
                🆕 Template
              </button>
              <button
                onClick={handleConsolidateProject}
                disabled={!Object.values(timelineClips).some((clip) => clip.audioFilePath)}
                style={{
                  ...buttonStyle(!Object.values(timelineClips).some((clip) => clip.audioFilePath)),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#2a4a5a",
                }}
              >
                Consolidate
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
                onClick={() => setShowExportDialog(true)}
                disabled={exportPayload.renderClips.length === 0}
                style={{
                  ...buttonStyle(exportPayload.renderClips.length === 0),
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "#5a2a5a",
                }}
              >
                🔊 Export Audio
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
            <>
              <div
                style={{
                  ...panelStyle,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                }}
              >
                <select
                  aria-label="Pattern Bank"
                  value={selectedPatternId ?? ""}
                  onChange={(event) => selectPattern(event.target.value || null)}
                  style={{ ...buttonStyle(), padding: "6px 8px", background: COLORS.bg, color: COLORS.text }}
                >
                  {patterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => addPattern(createDefaultPattern())} style={buttonStyle()}>
                  New Pattern
                </button>
                <button
                  onClick={() => selectedPatternId && duplicatePattern(selectedPatternId)}
                  disabled={!selectedPatternId}
                  style={buttonStyle(!selectedPatternId)}
                >
                  Duplicate
                </button>
                <button
                  onClick={() => selectedPatternId && removePattern(selectedPatternId)}
                  disabled={!selectedPatternId}
                  style={buttonStyle(!selectedPatternId)}
                >
                  Delete
                </button>
                {selectedPattern && (
                  <input
                    aria-label="Pattern name"
                    value={selectedPattern.name}
                    onChange={(event) => updatePattern(selectedPattern.id, { name: event.target.value })}
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: 7,
                      background: COLORS.bg,
                      color: COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 4,
                    }}
                  />
                )}
              </div>
              {selectedPattern && (
                <PatternEditor
                  key={selectedPattern.id}
                  isPlaying={transport.isPlaying}
                  currentBeat={transport.currentBeat}
                  initialPattern={selectedPattern.pattern}
                  initialSwing={selectedPattern.swing}
                  initialQa={selectedPattern.qa}
                  initialReasoning={selectedPattern.reasoning}
                  onPatternChange={(pattern) => updatePattern(selectedPattern.id, { pattern })}
                  onSwingChange={(swing) => updatePattern(selectedPattern.id, { swing })}
                  onMetadataChange={(qa, reasoning) =>
                    updatePattern(selectedPattern.id, { qa, reasoning })
                  }
                  onSendToTimeline={(notes, _name, qa) =>
                    sendPatternToTimeline(notes, selectedPattern.name, qa)
                  }
                />
              )}
            </>
          )}

          {showTimeline && (
            <div style={panelStyle}>
              {selectedTimelineClip?.midiData ? (
                <PianoRoll
                  notes={selectedTimelineClip.midiData.notes.map((note, index) => ({
                    ...note,
                    id: `${selectedTimelineClip.id}-note-${index}`,
                  }))}
                  onChange={(notes) => {
                    const nextNotes = notes.map(({ id: _id, ...note }) => note);
                    updateClipMidiNotes(selectedTimelineClip.id, nextNotes);
                    setClips((prev) =>
                      prev.map((clip) =>
                        clip.id === selectedTimelineClip.id
                          ? { ...clip, midiData: { notes: nextNotes } }
                          : clip
                      )
                    );
                  }}
                  isPlaying={transport.isPlaying}
                  currentBeat={transport.currentBeat - selectedTimelineClip.start}
                  snapToGrid
                  gridDivision={0.25}
                />
              ) : selectedTimelineClip?.audioFilePath ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <strong style={{ fontSize: 12 }}>{selectedTimelineClip.name}</strong>
                  <label style={{ fontSize: 11, color: COLORS.textMuted }}>
                    Clip gain
                    <input
                      aria-label="Audio clip gain"
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={selectedTimelineClip.gain ?? 1}
                      onChange={(event) =>
                        useTimelineStore.getState().updateClip(selectedTimelineClip.id, {
                          gain: Number(event.target.value),
                          updatedAt: Date.now() / 1000,
                        })
                      }
                    />
                  </label>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                    Source offset {(selectedTimelineClip.audioSourceOffset ?? 0).toFixed(2)}s
                  </span>
                </div>
              ) : (
                <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  Select a MIDI clip in the Timeline to edit it in Piano Roll.
                </div>
              )}
            </div>
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

          {showSamples && (
            <SampleBrowser
              onSampleSelect={(path, info) => {
                const state = useTimelineStore.getState();
                let targetTrack = state.tracks.find(
                  (track) => track.id === state.selectedTrackId && track.type === "audio"
                ) ?? state.tracks.find((track) => track.type === "audio");
                if (!targetTrack) {
                  targetTrack = {
                    id: crypto.randomUUID(),
                    name: "Audio",
                    type: "audio",
                    color: "#4ade80",
                    volume: 0.8,
                    pan: 0,
                    muted: false,
                    solo: false,
                    arm: false,
                    clips: [],
                    automationLanes: [],
                  };
                  addTrack(targetTrack);
                  createChannel(targetTrack.id, targetTrack.name);
                }
                const clipId = crypto.randomUUID();
                const duration = info.duration_secs > 0 ? info.duration_secs * (transport.bpm / 60) : 4;
                const now = Date.now() / 1000;
                addTimelineClip({
                  id: clipId,
                  name: info.filename.replace(/\.[^.]+$/, ""),
                  type: "audio",
                  trackId: targetTrack.id,
                  start: state.cursorPosition,
                  duration,
                  loop: false,
                  color: "#4ade80",
                  audioFilePath: path,
                  audioSourceOffset: 0,
                  audioSourceDuration: info.duration_secs || undefined,
                  gain: 1,
                  playback: { instrument: "sample" },
                  metadata: { generative: false },
                  createdAt: now,
                  updatedAt: now,
                });
                setClips((prev) => [
                  ...prev,
                  {
                    id: clipId,
                    name: info.filename.replace(/\.[^.]+$/, ""),
                    duration,
                    color: "#3a5a2a",
                    audioFilePath: path,
                    audioSourceOffset: 0,
                    audioSourceDuration: info.duration_secs || undefined,
                    gain: 1,
                  },
                ]);
                setStatus(`Sample loaded: ${info.filename}`);
              }}
            />
          )}

          {showEffects && (
            <div style={panelStyle}>
              {selectedTimelineTrack ? (
                <>
                  <EffectsChain
                    effects={selectedTrackEffects}
                    onChange={(effects) => updateTrack(selectedTimelineTrack.id, { effects })}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {[
                      "volume",
                      "pan",
                      "send.reverb",
                      "send.delay",
                      ...selectedTrackEffects.flatMap((effect) =>
                        Object.keys(effect.params).map((param) => `fx.${effect.id}.${param}`)
                      ),
                    ].map((parameter) => (
                      <button
                        key={parameter}
                        disabled={selectedTimelineTrack.automationLanes.some(
                          (lane) => lane.parameter === parameter
                        )}
                        onClick={() => {
                          const lane = createAutomationLane(selectedTimelineTrack.id, parameter);
                          updateTrack(selectedTimelineTrack.id, {
                            automationLanes: [
                              ...selectedTimelineTrack.automationLanes,
                              {
                                id: lane.id,
                                parameter: lane.parameter,
                                points: lane.points,
                                mode: "read",
                              },
                            ],
                          });
                        }}
                        style={{ ...buttonStyle(false), padding: "4px 8px", fontSize: 10 }}
                      >
                        Automate {parameter}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  Select a track to edit its FX and automation.
                </div>
              )}
            </div>
          )}

          {showMixer && (
            <Mixer
              onVolumeChange={(trackId, vol) => updateChannel(trackId, { volume: vol })}
              onPanChange={(trackId, pan) => updateChannel(trackId, { pan })}
            />
          )}

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
                  if (!selectedTimelineTrack) return;
                  const updated = addAutomationPoint(lane, time, value);
                  updateTrack(selectedTimelineTrack.id, {
                    automationLanes: selectedTimelineTrack.automationLanes.map((item) =>
                      item.id === lane.id
                        ? { id: updated.id, parameter: updated.parameter, points: updated.points, mode: updated.mode }
                        : item
                    ),
                  });
                }}
                onRemovePoint={(time: number) => {
                  if (!selectedTimelineTrack) return;
                  const updated = removeAutomationPoint(lane, time);
                  updateTrack(selectedTimelineTrack.id, {
                    automationLanes: selectedTimelineTrack.automationLanes.map((item) =>
                      item.id === lane.id
                        ? { id: updated.id, parameter: updated.parameter, points: updated.points, mode: updated.mode }
                        : item
                    ),
                  });
                }}
              />
            ))}

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
                bpm={transport.bpm}
                onPlayClip={(id) => {
                  const clip = clips.find((c) => c.id === id);
                  if (clip) playClip(clip);
                }}
                onSeek={handleSeek}
                onAddTrack={handleAddTrack}
                onRemoveTrack={handleRemoveTrack}
                onDeleteClip={(id) => setClips((prev) => prev.filter((clip) => clip.id !== id))}
                onDuplicateClip={(clip) => setClips((prev) => [...prev, clip])}
              />
            ) : (
              <div style={{ flex: 1, overflow: "auto" }}>
                <SessionViewGrid
                  clips={clips}
                  onLaunchScene={launchSessionScene}
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

      <ExportAudioDialog
        isOpen={showExportDialog}
        isExporting={isExportingAudio}
        preset={renderPreset}
        progress={exportProgress.progress}
        progressLabel={exportProgress.label}
        summary={exportSummary}
        renderEngine={renderEngine}
        outputMode={renderOutputMode}
        onPresetChange={setRenderPreset}
        onRenderEngineChange={setRenderEngine}
        onOutputModeChange={setRenderOutputMode}
        onClose={() => setShowExportDialog(false)}
        onCancelExport={
          activeRenderJobId
            ? () => {
                void cancelRenderJob(activeRenderJobId);
                setStatus("Render cancellation requested");
              }
            : undefined
        }
        onExport={handleExportAudio}
      />

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
        <span style={{ marginLeft: "auto" }}>Beehive Studio v0.3.0-alpha</span>
      </div>
    </div>
  );
}

export default App;
