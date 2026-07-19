import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { SessionViewGrid } from "./components/SessionView/SessionViewGrid";
import { useTransport, ScheduledClip } from "./lib/transport";
import { saveProject, loadProject, listProjects, deleteProject } from "./lib/db";
import { MidiIoPanel } from "./components/MidiIoPanel";
import { Timeline } from "./components/Timeline/Timeline";
import { useTimelineStore } from "./lib/timelineStore";
import { PatternEditor } from "./components/PatternEditor/PatternEditor";
import type { QaResult } from "./components/PatternEditor/PatternEditor";
import { PianoRoll } from "./components/PianoRoll/PianoRoll";
import { MidiToolsPanel } from "./components/MidiToolsPanel/MidiToolsPanel";
import { exportProjectAudio } from "./lib/audioEngine";
import { ExportAudioDialog } from "./components/ExportAudioDialog";
import { PublishDialog } from "./components/PublishDialog/PublishDialog";
import { ExploreDialog } from "./components/ExploreDialog/ExploreDialog";
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
import { ProjectPanel } from "./components/ProjectPanel";
import { saveSnapshot, ensureProjectInit, forkSession, readClips, tagCommit } from "./lib/projectGit";
import {
  assignClipIdsToTracks,
  findTrackIdForClip,
  normalizeTimelineClip,
  quantizeToBar,
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
import { renderOffline } from "./lib/rustRender";
import { undo as undoTimeline, redo as redoTimeline } from "./lib/timelineHistory";

// JetBee IDE layout components
import { WorkbenchLayout } from "./components/Layout/WorkbenchLayout";
import { TopBar } from "./components/Layout/TopBar";
import { EditorWorkbench } from "./components/Layout/EditorWorkbench";
import { StatusBar } from "./components/Layout/StatusBar";
import { SwarmField } from "./components/SwarmField/SwarmField";
import { syncEngineToTransport, type ReactiveEngine } from "./lib/musicReactiveEngine";
import { AgentRoster } from "./components/AgentDirector/AgentRoster";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { PromptEditor } from "./components/PromptEditor/PromptEditor";
import { LuaEditor } from "./components/LuaEditor/LuaEditor";
import { WaveformViewer } from "./components/WaveformViewer/WaveformViewer";
import { TastePanel } from "./components/TasteGraph";
import { BuildConsole } from "./components/BuildConsole/BuildConsole";
import { SwarmTrace } from "./components/SwarmTrace/SwarmTrace";
import type { SwarmStep } from "./components/SwarmTrace/SwarmTrace";
import { useProjectSocket } from "./lib/useProjectSocket";
import { useBuildLogStore } from "./lib/buildLogStore";
import { useHiveAdvisor } from "./lib/useHiveAdvisor";
import { AgentDirector } from "./components/AgentDirector/AgentDirector";
import { ProposalPanel } from "./components/ProposalPanel/ProposalPanel";
import { BuildPlanReview } from "./components/BuildPlanReview/BuildPlanReview";
import { useJetBeeBuild } from "./lib/useJetBeeBuild";
import type { BuildEvent, PatchOperation } from "../../../packages/core-models/index";
import { PluginMarketplace } from "./components/PluginMarketplace/PluginMarketplace";

// JetBee theme
import "./styles/jetbee-theme.css";

// Keyboard store
import {
  useKeyboardStore,
  handleGlobalKeydown,
  trackDoubleShift,
  DEFAULT_KEYMAP,
} from "./lib/keyboardStore";

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

function inferClipDuration(
  notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>
): number {
  if (notes.length === 0) return 4;
  const endBeat = Math.max(...notes.map((n) => n.start + n.duration));
  // Round up to the next whole bar (assume 4/4)
  return Math.max(4, Math.ceil(endBeat / 4) * 4);
}

function JetBeeApp() {
  // ── Original state (preserved exactly) ──
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
  const timelineScenes = useTimelineStore((s) => s.scenes);
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
  const [renderEngine, setRenderEngine] = useState<"python" | "desktop" | "rust">("python");
  const [renderOutputMode, setRenderOutputMode] = useState<"master" | "master_and_stems">("master");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showExploreDialog, setShowExploreDialog] = useState(false);
  const [publishAudioBlob, setPublishAudioBlob] = useState<Blob | null>(null);
  const [publishDuration, setPublishDuration] = useState<number | undefined>(undefined);
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

  // ── New JetBee state ──
  const buildLogs = useBuildLogStore((s) => s.logs);
  const addBuildLog = useBuildLogStore((s) => s.addLog);
  const [swarmSteps, setSwarmSteps] = useState<SwarmStep[]>([]);
  const [swarmEngine, setSwarmEngine] = useState<ReactiveEngine | null>(null);

  // ── Hive 999 advisor ──
  const { proposal: hiveProposal, isLoading: hiveLoading, error: hiveError, clearProposal, requestAdvice } = useHiveAdvisor();
  const [advisorProfile, setAdvisorProfile] = useState<"reasoning" | "fast_pattern">("fast_pattern");
  const {
    job: activeBuild,
    error: buildError,
    loading: buildLoading,
    request: requestBuild,
    approve: approveBuild,
    reject: rejectBuild,
    consumeEvent: consumeBuildEvent,
  } = useJetBeeBuild();
  const [projectRevision, setProjectRevision] = useState(0);

  // ── WebSocket connection to JetBee backend ──
  const { connected: wsConnected, reconnecting: wsReconnecting, lastMessage } = useProjectSocket(projectName);
  const [activeCenterTab, setActiveCenterTab] = useState("prompt");
  const [lastIntent, setLastIntent] = useState("");

  // ── Original callbacks (preserved exactly) ──
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

  // Keyboard shortcuts — Delete/Backspace preserved from original.
  // Space / Ctrl+S / Ctrl+E now handled by the JetBee command palette system.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
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
  }, []);

  // Sync generated/session clips into full timeline clips
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

  // Wire timeline track state to the Web Audio mixer
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

  const playClip = useCallback(
    async (clip: Clip) => {
      if (!clip.midiData?.notes?.length && !clip.audioFilePath) {
        setStatus("Clip has no playable content");
        return;
      }

      setStatus("Playing clip...");

      const timelineClip = timelineClips[clip.id] as TimelineClip | undefined;
      const trackId = timelineClip?.trackId;
      const instrument = timelineClip?.playback?.instrument ?? "bass";

      const scheduled: ScheduledClip = {
        id: clip.id,
        notes: clip.midiData?.notes ?? [],
        startBeat: 0,
        loop: false,
        channel: 0,
        channelId: trackId,
        instrument,
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
    [projectName, transport, timelineClips]
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

  const launchSceneRef = useRef<((sceneId: string, mode: "bar" | "8th" | "16th") => void) | null>(null);
  const launchSceneById = useCallback(
    async (sceneId: string, mode: "bar" | "8th" | "16th") => {
      const state = useTimelineStore.getState();
      const scene = state.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const ids = new Set(scene.clipIds);
      const sceneClips = Object.fromEntries(
        Object.entries(state.clips).filter(([cid]) => ids.has(cid))
      ) as Record<string, TimelineClip>;
      const scheduled = buildArrangementPlaybackClips(state.tracks, sceneClips);
      const resolved = await Promise.all(
        scheduled.map(async (clip) => ({
          ...clip,
          audioFilePath: clip.audioFilePath
            ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
            : undefined,
        }))
      );
      const at = await transport.launchSceneQuantized(resolved, mode);
      setStatus(`Launched "${scene.name}" (${resolved.length} clips) at beat ${at?.toFixed(2) ?? "?"}`);
      // Follow action: advance to the next scene after N bars.
      const fa = scene.followAction;
      if (fa?.mode === "after_bars" && fa.nextSceneId) {
        const bars = fa.bars ?? 4;
        const ms = bars * 4 * (60_000 / transport.bpm);
        const next = fa.nextSceneId;
        window.setTimeout(() => launchSceneRef.current?.(next, mode), ms);
      }
    },
    [projectName, transport]
  );
  launchSceneRef.current = launchSceneById;

  const newScene = useCallback(() => {
    const count = useTimelineStore.getState().scenes.length + 1;
    useTimelineStore.getState().addScene({ id: crypto.randomUUID(), name: `Scene ${count}`, clipIds: [] });
  }, []);

  const addSelectedToScene = useCallback((sceneId: string) => {
    const sel = useTimelineStore.getState().selectedClipId;
    if (sel) {
      useTimelineStore.getState().moveClipToScene(sel, sceneId);
      setStatus("Added clip to scene");
    } else {
      setStatus("Select a clip first");
    }
  }, []);

  const sendBrief = useCallback(async (variationBrief?: string) => {
    const text = variationBrief ?? brief;
    if (!text.trim()) return;

    setIsLoading(true);
    setStreamLog([]);
    setStatus(variationBrief ? "Planning variation build..." : "Planning build...");

    try {
      setLastIntent(text.trim());
      const state = useTimelineStore.getState();
      const artifacts = [
        ...state.tracks.map((track) => ({
          id: track.id,
          kind: "track" as const,
          owner: "visual" as const,
          revision: projectRevision,
          name: track.name,
          summary: `${track.type} track with ${track.clips.length} clips`,
        })),
        ...Object.values(state.clips).map((clip) => ({
          id: clip.id,
          kind: "clip" as const,
          owner: "visual" as const,
          revision: projectRevision,
          name: clip.name,
          summary: `${clip.type} clip at beat ${clip.start}`,
        })),
      ];
      const job = await requestBuild({
        projectId: projectName,
        projectRevision,
        intent: text.trim(),
        source: "keyboard",
        selectedArtifactIds: selectedClipId ? [selectedClipId] : [],
        artifacts,
        compilerPreference: "auto",
        allowCloud: false,
        cloudApproved: false,
      });
      if (!job) throw new Error("Build plan request failed");
      if (!variationBrief) setBrief("");
      setStatus("Build plan ready for review");
      addBuildLog({
        level: job.plan.degraded ? "warn" : "info",
        message: `Build plan ready: ${job.plan.summary}`,
        taskId: job.id,
      });
      setSwarmSteps((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          agentId: "hive999",
          agentLabel: "Hive 999 Supervisor",
          agentColor: "var(--jb-comb)",
          timestamp: Date.now(),
          type: "thinking" as const,
          message: job.plan.summary,
        },
      ]);
    } catch (err) {
      console.error(err);
      setStatus("Build planning failed — is JetBee API running on port 9000?");

      addBuildLog({
          level: "error",
          message: "Generation failed: " + String(err),
        });

      setSwarmSteps((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          agentId: "composer",
          agentLabel: "Composer",
          agentColor: "var(--jb-error)",
          timestamp: Date.now(),
          type: "error" as const,
          message: "Generation failed: " + String(err),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [brief, projectName, projectRevision, requestBuild, selectedClipId]);

  const validateApprovedOperations = useCallback((operations: PatchOperation[]) => {
    for (const operation of operations) {
      if (operation.op !== "set_parameter") {
        throw new Error(`Unsupported Phase 1 patch operation: ${operation.op}`);
      }
      if (operation.path === "settings.bpm" || operation.path === "session.bpm") {
        const bpm = Number(operation.value);
        if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error("Invalid BPM patch");
        continue;
      }
      throw new Error(`Unsupported Phase 1 patch path: ${operation.path}`);
    }
  }, []);

  const applyApprovedOperations = useCallback((operations: PatchOperation[]) => {
    validateApprovedOperations(operations);
    for (const operation of operations) {
      if (operation.path === "settings.bpm" || operation.path === "session.bpm") {
        transport.setBpm(Number(operation.value));
      }
    }
  }, [transport, validateApprovedOperations]);

  const handleApproveBuild = useCallback(async () => {
    if (!activeBuild) return;
    try {
      const operations = activeBuild.plan.proposedPatches.flatMap((patch) => patch.operations);
      validateApprovedOperations(operations);
      await ensureProjectInit(projectName);
      await saveSnapshot(projectName, currentProjectDocumentJson(), `Pre-build ${activeBuild.id}`);
      const approved = await approveBuild(projectName, activeBuild.id, projectRevision);
      if (!approved) throw new Error("Build approval failed");
      applyApprovedOperations(operations);
      setProjectRevision((revision) => revision + 1);
      setStatus(`Build queued with ${approved.provider ?? "selected provider"}`);
    } catch (err) {
      setStatus(`Build approval failed: ${String(err)}`);
    }
  }, [activeBuild, applyApprovedOperations, approveBuild, currentProjectDocumentJson, projectName, projectRevision, validateApprovedOperations]);

  const handleRejectBuild = useCallback(async () => {
    if (!activeBuild) return;
    await rejectBuild(projectName, activeBuild.id);
    setStatus("Build plan rejected; project state unchanged");
  }, [activeBuild, projectName, rejectBuild]);

  const doResearch = useCallback(async () => {
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
  }, [brief]);

  function acceptClip(id: string) {
    // Commit the proposed clip: clear its `proposed` flag on the timeline so it
    // renders as a real arrangement clip, and drop it from the pending grid.
    const { clips: tlClips, updateClip } = useTimelineStore.getState();
    const existing = tlClips[id];
    if (existing) {
      updateClip(id, {
        metadata: { ...existing.metadata, proposed: false },
      });
    }
    setClips((prev) => prev.filter((c) => c.id !== id));
    setStatus("✓ Clip committed to arrangement");
  }

  function rejectClip(id: string) {
    // Humans dispose: remove the proposal from BOTH the pending grid and the
    // timeline (it was placed speculatively on generation).
    useTimelineStore.getState().removeClip(id);
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

  const runLua = useCallback(async () => {
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
  }, [luaScript]);

  const handleSaveProject = useCallback(async () => {
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
        lastIntent ? `AI Generation: ${lastIntent}` : `Save: ${projectName}`,
      );
      setLastIntent(""); // Clear after save
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
  }, [clips.length, currentProjectDocumentJson, projectName]);

  function handleNewProjectWithTemplate() {
    const templateTracks = [
      { name: "Kick", type: "midi" as const, color: "#ef4444", pitch: 36 },
      { name: "Snare", type: "midi" as const, color: "#fbbf24", pitch: 38 },
      { name: "Hi-Hats", type: "midi" as const, color: "#60a5fa", pitch: 42 },
      { name: "Bass", type: "midi" as const, color: "#ff8c42", pitch: 36 },
      { name: "Synth", type: "midi" as const, color: "#a855f7", pitch: 60 },
      { name: "Pad", type: "midi" as const, color: "#06b6d4", pitch: 48 },
    ];

    const { tracks } = useTimelineStore.getState();
    for (const t of tracks) {
      removeTrack(t.id);
      removeChannel(t.id);
    }
    setClips([]);
    setTimelineClips({});
    setPatterns([]);

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
        filters: [
          { name: "WAV", extensions: ["wav"] },
          { name: "FLAC", extensions: ["flac"] },
        ],
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
      let usedEngine: "python" | "desktop" | "rust" = renderEngine;
      if (renderEngine === "rust") {
        setStatus(`Rendering audio with the Rust engine (${renderPreset})...`);
        const format = savePath.toLowerCase().endsWith(".flac") ? "flac" : "wav";
        const result = await renderOffline(
          resolvedClips,
          exportPayload.mixerTracks,
          transport.bpm,
          renderPreset,
          format,
          renderOutputMode
        );
        wavData = new Uint8Array(await invoke<number[]>("read_file_bytes", { path: result.master_path }));
        stemSources = result.stem_paths ?? [];
      } else if (renderEngine === "python") {
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

  const handlePublishFromExport = useCallback(async () => {
    if (exportPayload.renderClips.length === 0) {
      setStatus("Nothing audible to publish — arrange some clips first");
      return;
    }
    setStatus("Preparing audio for MixHive...");
    try {
      const resolvedClips = await Promise.all(
        exportPayload.renderClips.map(async (clip) => ({
          ...clip,
          audioFilePath: clip.audioFilePath
            ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
            : undefined,
        }))
      );
      const wavData = await exportProjectAudio(
        resolvedClips,
        transport.bpm,
        renderPreset,
        exportPayload.mixerTracks
      );
      const blob = new Blob([wavData.buffer as ArrayBuffer], { type: "audio/wav" });
      setPublishAudioBlob(blob);
      setPublishDuration(exportSummary.durationSeconds);
      setShowPublishDialog(true);
      setStatus("Publish dialog open");
    } catch (err) {
      setStatus(`Publish prep failed: ${String(err)}`);
    }
  }, [exportPayload, exportSummary, projectName, renderPreset, transport.bpm]);

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

  // ── JetBee command palette registration ──
  useEffect(() => {
    const { registerCommand, bindShortcut, unbindShortcut, unregisterCommand } = useKeyboardStore.getState();

    registerCommand({ id: "palette.open", label: "Command Palette", category: "System", shortcut: "ctrl+shift+a", action: () => useKeyboardStore.getState().openPalette() });
    registerCommand({ id: "generate.build", label: "Generate", category: "Build", shortcut: "ctrl+shift+g", action: () => sendBrief() });
    registerCommand({ id: "transport.playPause", label: "Play / Pause", category: "Transport", shortcut: "space", action: () => { if (transport.isPlaying) transport.pause(); else handleTransportPlay(); } });
    registerCommand({ id: "transport.stop", label: "Stop", category: "Transport", shortcut: "ctrl+space", action: () => transport.stop() });
    registerCommand({ id: "file.save", label: "Save Project", category: "File", shortcut: "ctrl+s", action: () => handleSaveProject() });
    registerCommand({ id: "file.export", label: "Export Audio", category: "File", shortcut: "ctrl+shift+e", action: () => setShowExportDialog(true) });
    registerCommand({ id: "project.focusExplorer", label: "Focus Explorer", category: "Project", shortcut: "alt+1", action: () => document.querySelector<HTMLElement>('[data-jetbee-pane="explorer"]')?.focus() });
    registerCommand({ id: "project.focusInspector", label: "Focus Inspector", category: "Project", shortcut: "alt+2", action: () => document.querySelector<HTMLElement>('[data-jetbee-pane="inspector"]')?.focus() });
    registerCommand({ id: "project.focusConsole", label: "Focus Build Console", category: "Project", shortcut: "alt+0", action: () => document.querySelector<HTMLElement>('[data-jetbee-pane="console"]')?.focus() });
    registerCommand({ id: "editor.intention", label: "Show Intentions", category: "Editor", shortcut: "alt+enter", action: () => {} });
    registerCommand({ id: "agent.sendBrief", label: "Send Brief", category: "Agent", shortcut: "ctrl+return", action: () => sendBrief() });
    registerCommand({ id: "agent.critic", label: "Send to Critic", category: "Agent", shortcut: "ctrl+shift+c", action: () => {} });
    registerCommand({ id: "git.commit", label: "Commit", category: "Git", shortcut: "ctrl+k", action: () => handleSaveProject() });
    registerCommand({ id: "edit.undo", label: "Undo", category: "Edit", shortcut: "ctrl+z", action: () => undoTimeline() });
    registerCommand({ id: "edit.redo", label: "Redo", category: "Edit", shortcut: "ctrl+shift+z", action: () => redoTimeline() });
    registerCommand({ id: "window.reload", label: "Reload Window", category: "Window", shortcut: "ctrl+shift+f5", action: () => window.location.reload() });

    for (const entry of DEFAULT_KEYMAP) {
      bindShortcut(entry.commandId, entry.shortcut);
    }
    bindShortcut("file.export", "ctrl+e");

    return () => {
      for (const entry of DEFAULT_KEYMAP) {
        unbindShortcut(entry.shortcut);
      }
      unbindShortcut("ctrl+e");
      const ids = ["palette.open", "generate.build", "transport.playPause", "transport.stop", "file.save", "file.export", "project.focusExplorer", "project.focusInspector", "project.focusConsole", "editor.intention", "agent.sendBrief", "agent.critic", "git.commit", "edit.undo", "edit.redo", "window.reload"];
      for (const id of ids) {
        unregisterCommand(id);
      }
    };
  }, [transport.isPlaying, transport.pause, transport.stop, handleTransportPlay, handleSaveProject, sendBrief]);

  // Attach global keydown listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleGlobalKeydown(e);
      trackDoubleShift(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── WebSocket message processor ──
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type.startsWith("build.") || lastMessage.type === "patch.applied") {
      const event = lastMessage as unknown as BuildEvent;
      consumeBuildEvent(event);
      const progress = Number(event.metadata?.progress ?? 0);
      addBuildLog({
        level: event.type === "build.failed" ? "error" : event.type === "build.completed" ? "success" : "info",
        message: `${event.type}${progress ? ` (${Math.round(progress * 100)}%)` : ""}`,
        taskId: event.buildId,
        backend: String(event.metadata?.provider ?? "jetbee-gateway"),
      });
      if (event.type === "build.artifact_ready") {
        const artifact = event.metadata?.artifact as { id?: string; path?: string } | undefined;
        if (artifact?.path) {
          const state = useTimelineStore.getState();
          let track = state.tracks.find((item) => item.type === "audio");
          if (!track) {
            track = {
              id: crypto.randomUUID(), name: "Generated Audio", type: "audio", color: COLORS.accent,
              volume: 0.8, pan: 0, muted: false, solo: false, arm: false, clips: [], automationLanes: [],
            };
            addTrack(track);
            createChannel(track.id, track.name);
          }
          const id = artifact.id ?? crypto.randomUUID();
          if (!state.clips[id]) {
            addTimelineClip(normalizeTimelineClip({ id, name: `Build ${event.buildId.slice(0, 8)}`, audioFilePath: artifact.path }, track.id, track.clips.length));
          }
        }
      }
    }
    if (lastMessage.type === "generation_status") {
      const msg = lastMessage as any;
      addBuildLog({
        level: msg.status === 1 ? "success" : msg.status === 2 ? "error" : "info",
        message: `[${msg.backend}] ${msg.status_text} ${msg.progress ? "(" + Math.round(msg.progress * 100) + "%)" : ""}`,
        taskId: msg.task_id,
        backend: msg.backend,
      });
      if (msg.status === 1 || msg.status === 2) {
        setIsLoading(false);
      }
    }
    if (lastMessage.type === "agent_trace") {
      const step = (lastMessage as any).step;
      if (step) setSwarmSteps((prev) => [...prev, step]);
    }
  }, [lastMessage, addBuildLog, addTimelineClip, addTrack, consumeBuildEvent]);

  // ── Ambient SwarmField reactivity ──
  // Feed transport state to the swarm engine. The engine advances the beat itself,
  // so we only re-sync on play/pause and BPM changes (currentBeat is the seed).
  useEffect(() => {
    if (!swarmEngine) return;
    syncEngineToTransport(swarmEngine, {
      isPlaying: transport.isPlaying,
      bpm: transport.bpm,
      beat: transport.currentBeat,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swarmEngine, transport.isPlaying, transport.bpm]);

  // Pulse the swarm's energy whenever an agent takes a step.
  useEffect(() => {
    if (!swarmEngine || swarmSteps.length === 0) return;
    swarmEngine.triggerAgent(swarmSteps[swarmSteps.length - 1].agentId);
  }, [swarmSteps, swarmEngine]);

  // ── Layout construction ──

  const projectPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <div style={{ padding: 8 }}>
        <ProjectPanel projectName={projectName} visible={true} onClose={() => {}} onBranchSwitch={handleBranchSwitch} />
        <div style={{ marginTop: 8 }}>
          <div className="jetbee-panel-header" style={{ marginBottom: 4 }}>Saved Projects</div>
          {savedProjects.length === 0 && <div style={{ color: "var(--jb-text-muted)", fontSize: 12 }}>No saved projects yet.</div>}
          {savedProjects.map((name) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", borderRadius: 4, marginBottom: 2, background: name === projectName ? "var(--jb-panel-hover)" : "transparent" }}>
              <span onClick={() => handleLoadProject(name)} style={{ flex: 1, fontSize: 12, color: "var(--jb-text)", cursor: "pointer" }}>{name}</span>
              <button onClick={() => handleDeleteProject(name)} style={{ padding: "1px 4px", fontSize: 10, background: "transparent", border: "none", color: "var(--jb-error)", cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          <button className="jetbee-toolbtn" onClick={handleNewProjectWithTemplate}>🆕 New</button>
          <button className="jetbee-toolbtn" onClick={handleFork} disabled={clips.length === 0}>🪝 Fork</button>
          <button className="jetbee-toolbtn" onClick={handleConsolidateProject} disabled={!Object.values(timelineClips).some((clip) => clip.audioFilePath)}>Consolidate</button>
        </div>
      </div>
      <div style={{ padding: 8, borderTop: "1px solid var(--jb-border)" }}>
        <MidiIoPanel onStatus={setStatus} onNote={(note) => setClips((prev) => [...prev, { id: crypto.randomUUID(), name: `MIDI ${note.pitch}`, duration: 0.5, color: "#5a3a2a", midiData: { notes: [note] } }])} />
      </div>
    </div>
  );

  const patternPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "var(--jb-toolbar-bg)", borderBottom: "1px solid var(--jb-border)", flexShrink: 0 }}>
        <select aria-label="Pattern Bank" value={selectedPatternId ?? ""} onChange={(event) => selectPattern(event.target.value || null)} style={{ padding: "4px 6px", background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4 }}>
          {patterns.map((pattern) => (
            <option key={pattern.id} value={pattern.id}>{pattern.name}</option>
          ))}
        </select>
        <button className="jetbee-toolbtn" onClick={() => addPattern(createDefaultPattern())}>New Pattern</button>
        <button className="jetbee-toolbtn" onClick={() => selectedPatternId && duplicatePattern(selectedPatternId)} disabled={!selectedPatternId}>Duplicate</button>
        <button className="jetbee-toolbtn" onClick={() => selectedPatternId && removePattern(selectedPatternId)} disabled={!selectedPatternId}>Delete</button>
        {selectedPattern && (
          <input aria-label="Pattern name" value={selectedPattern.name} onChange={(event) => updatePattern(selectedPattern.id, { name: event.target.value })} style={{ flex: 1, minWidth: 120, padding: "4px 6px", background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4 }} />
        )}
      </div>
      {selectedPattern && (
        <div style={{ flex: 1, overflow: "hidden" }}>
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
            onMetadataChange={(qa, reasoning) => updatePattern(selectedPattern.id, { qa, reasoning })}
            onSendToTimeline={(notes, _name, qa) => sendPatternToTimeline(notes, selectedPattern.name, qa)}
          />
        </div>
      )}
      {!selectedPattern && (
        <div style={{ color: "var(--jb-text-muted)", fontSize: 12, padding: 20 }}>No pattern selected.</div>
      )}
    </div>
  );

  const samplePanel = (
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
          start: quantizeToBar(state.cursorPosition),
          duration,
          loop: false,
          color: "#4ade80",
          audioFilePath: path,
          audioSourceOffset: 0,
          audioSourceDuration: info.duration_secs || undefined,
          gain: 1,
          playback: { instrument: "sample" },
          metadata: { generative: false, proposed: true },
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
  );

  const gitPanel = (
    <ProjectPanel projectName={projectName} visible={true} onClose={() => {}} onBranchSwitch={handleBranchSwitch} />
  );

  const arrangementPanel = showTimeline ? (
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
    <SessionViewGrid
      clips={clips}
      projectId={projectName}
      onLaunchScene={launchSessionScene}
      scenes={timelineScenes}
      onNewScene={newScene}
      onLaunchSceneById={launchSceneById}
      onAddSelectedToScene={addSelectedToScene}
      onPlayClip={(id) => {
        const clip = clips.find((c) => c.id === id);
        if (clip) playClip(clip);
      }}
      onAccept={acceptClip}
      onReject={rejectClip}
      onVariations={generateVariations}
    />
  );

  const pianoPanel = selectedTimelineClip?.midiData ? (
    (() => {
      const clipId = selectedTimelineClip.id;
      const applyNotes = (nextNotes: NonNullable<TimelineClip["midiData"]>["notes"]) => {
        updateClipMidiNotes(clipId, nextNotes);
        setClips((prev) =>
          prev.map((clip) => (clip.id === clipId ? { ...clip, midiData: { notes: nextNotes } } : clip))
        );
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <MidiToolsPanel notes={selectedTimelineClip.midiData.notes} onChange={applyNotes} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <PianoRoll
              notes={selectedTimelineClip.midiData.notes.map((note, index) => ({
                ...note,
                id: `${clipId}-note-${index}`,
              }))}
              onChange={(notes) => applyNotes(notes.map(({ id: _id, ...note }) => note))}
              isPlaying={transport.isPlaying}
              currentBeat={transport.currentBeat - selectedTimelineClip.start}
              snapToGrid
              gridDivision={0.25}
            />
          </div>
        </div>
      );
    })()
  ) : (
    <div style={{ color: "var(--jb-text-muted)", fontSize: 12, padding: 20 }}>
      Select a MIDI clip in the Timeline to edit it in Piano Roll.
    </div>
  );

  const mixerPanel = (
    <Mixer onVolumeChange={(trackId, vol) => updateChannel(trackId, { volume: vol })} onPanChange={(trackId, pan) => updateChannel(trackId, { pan })} />
  );

  const effectsPanel = selectedTimelineTrack ? (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--jb-text)" }}>
        {selectedTimelineTrack.name} ({selectedTimelineTrack.type})
      </div>
      {showEffects && (
        <>
          <EffectsChain effects={selectedTrackEffects} onChange={(effects) => updateTrack(selectedTimelineTrack.id, { effects })} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
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
                disabled={selectedTimelineTrack.automationLanes.some((lane) => lane.parameter === parameter)}
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
                className="jetbee-toolbtn"
                style={{ fontSize: 10, padding: "2px 6px" }}
              >
                Automate {parameter}
              </button>
            ))}
          </div>
        </>
      )}
      {!showEffects && (
        <div style={{ color: "var(--jb-text-muted)", fontSize: 12 }}>Effects panel hidden.</div>
      )}
      {automationLanes.length > 0 && automationLanes.map((lane) => (
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
    </div>
  ) : (
    <div style={{ color: "var(--jb-text-muted)", fontSize: 12, padding: 20 }}>Select a track to edit its FX and automation.</div>
  );

  const audioClipControls =
    selectedTimelineClip && selectedTimelineClip.type === "audio" ? (
      <div style={{ padding: 10, borderBottom: "1px solid var(--jb-border)", fontSize: 11 }}>
        <div style={{ fontWeight: 600, color: "var(--jb-text)", marginBottom: 6 }}>
          Audio Clip — {selectedTimelineClip.name}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: "var(--jb-text-muted)" }}>
          Warp ×{(selectedTimelineClip.warpStretchFactor ?? 1).toFixed(2)}
          <input
            type="range"
            aria-label="Warp"
            min={0.5}
            max={2}
            step={0.05}
            value={selectedTimelineClip.warpStretchFactor ?? 1}
            onChange={(e) =>
              useTimelineStore.getState().updateClip(selectedTimelineClip.id, {
                warpStretchFactor: parseFloat(e.target.value),
              })
            }
            style={{ flex: 1 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, color: "var(--jb-text-muted)" }}>
          Fade in (beats)
          <input
            type="number"
            aria-label="Fade in beats"
            min={0}
            step={0.25}
            value={selectedTimelineClip.fadeInBeats ?? 0}
            onChange={(e) =>
              useTimelineStore.getState().updateClip(selectedTimelineClip.id, {
                fadeInBeats: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            style={{ width: 60, background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4, padding: "2px 4px" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--jb-text-muted)" }}>
          Fade out (beats)
          <input
            type="number"
            aria-label="Fade out beats"
            min={0}
            step={0.25}
            value={selectedTimelineClip.fadeOutBeats ?? 0}
            onChange={(e) =>
              useTimelineStore.getState().updateClip(selectedTimelineClip.id, {
                fadeOutBeats: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            style={{ width: 60, background: "var(--jb-bg)", color: "var(--jb-text)", border: "1px solid var(--jb-border)", borderRadius: 4, padding: "2px 4px" }}
          />
        </label>
      </div>
    ) : null;

  const inspectorPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      {audioClipControls}
      <div style={{ flex: 1 }}>{effectsPanel}</div>
    </div>
  );

  const agentPanel = (
    <AgentDirector
      bpm={transport.bpm}
      onClipGenerated={(notes, reasoning) => {
        const state = useTimelineStore.getState();
        let targetTrack = state.tracks.find(
          (t) => t.type === "midi" && t.name.toLowerCase().includes("bass")
        );
        if (!targetTrack) {
          const trackId = crypto.randomUUID();
          targetTrack = {
            id: trackId,
            name: "Bass",
            type: "midi",
            color: "#ff8c42",
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false,
            arm: false,
            clips: [],
            automationLanes: [],
            instrument: { type: "tonejs", preset: "bass" },
          };
          addTrack(targetTrack);
          createChannel(targetTrack.id, targetTrack.name);
        }

        const clipId = crypto.randomUUID();
        const duration = inferClipDuration(notes);
        const now = Date.now() / 1000;
        const timelineClip: TimelineClip = {
          id: clipId,
          name: "Rolling Acid Bass",
          type: "midi",
          trackId: targetTrack.id,
          start: quantizeToBar(state.cursorPosition),
          duration,
          loop: false,
          midiData: { notes },
          playback: { instrument: "bass", preset: "acid" },
          metadata: {
            generative: true,
            proposed: true,
            agentId: "rhythm_groove",
            reasoningTrace: reasoning.join("\n"),
            confidence: 0.95,
            tags: ["acid", "techno", "bassline"],
          },
          createdAt: now,
          updatedAt: now,
        };
        addTimelineClip(timelineClip);

        // Also mirror into the Session View grid
        setClips((prev) => [
          ...prev,
          {
            id: clipId,
            name: timelineClip.name,
            duration,
            color: targetTrack.color,
            midiData: { notes },
            reasoning,
          },
        ]);
        setStreamLog(reasoning);
      }}
    />
  );

  const promptPanel = (
    <PromptEditor
      value={brief}
      onChange={setBrief}
      onGenerate={() => sendBrief()}
      onSendToCritic={() => {}}
      onTag={async (tagName) => {
        try {
          await tagCommit(projectName, tagName, `State tag from prompt: ${brief.slice(0, 30)}...`);
          setStatus(`Tagged state: ${tagName}`);
        } catch (e) {
          setStatus(`Tag failed: ${e}`);
        }
      }}
    />
  );

  const luaPanel = <LuaEditor sessionId={projectName} />;
  const waveformPanel = <WaveformViewer />;
  const pluginsPanel = <PluginMarketplace />;
  const tastePanel = <TastePanel projectId={projectName} />;

  const proposalPanel = (
    <ProposalPanel
      proposal={hiveProposal}
      isLoading={hiveLoading}
      error={hiveError}
      onDismiss={clearProposal}
      profile={advisorProfile}
      onProfileChange={setAdvisorProfile}
      onTryAlternative={(direction) =>
        void requestAdvice(`${brief} — explore this direction: ${direction}`, { profile: advisorProfile })
      }
      onExplain={() =>
        void requestAdvice(`${brief} — explain your reasoning for this proposal`, { profile: advisorProfile })
      }
    />
  );

  const buildPanel = (
    <BuildPlanReview
      job={activeBuild}
      loading={buildLoading}
      error={buildError}
      onApprove={handleApproveBuild}
      onReject={handleRejectBuild}
    />
  );

  const topBar = (
    <TopBar
      projectName={projectName}
      bpm={transport.bpm}
      isPlaying={transport.isPlaying}
      onPlayPause={transport.isPlaying ? transport.stop : handleTransportPlay}
      onStop={transport.stop}
      onSave={handleSaveProject}
      onExport={() => setShowExportDialog(true)}
      onOpenProject={() => setShowProjects(true)}
      onPublish={handlePublishFromExport}
    />
  );

  const leftTabs = useMemo(() => [
    { id: "project", icon: "📁", label: "Project", content: projectPanel },
    { id: "patterns", icon: "🎹", label: "Patterns", content: patternPanel },
    { id: "samples", icon: "🎧", label: "Samples", content: samplePanel },
    { id: "git", icon: "🌿", label: "Git", content: gitPanel },
    { id: "plugins", icon: "🔌", label: "Plugins", content: pluginsPanel },
  ], [projectPanel, patternPanel, samplePanel, gitPanel, pluginsPanel]);

  const center = (
    <EditorWorkbench
      arrangement={arrangementPanel}
      patternEditor={patternPanel}
      pianoRoll={pianoPanel}
      mixer={mixerPanel}
      effects={effectsPanel}
      prompt={promptPanel}
      lua={luaPanel}
      waveform={waveformPanel}
    />
  );

  const rightTabs = useMemo(() => [
    { id: "inspector", icon: "🔍", label: "Inspector", content: inspectorPanel },
    { id: "agents", icon: "🐝", label: "Agents", content: <AgentRoster /> },
    { id: "proposal", icon: "🍯", label: "Proposal", content: proposalPanel },
    { id: "taste", icon: "🕸️", label: "Taste", content: tastePanel },
  ], [inspectorPanel, proposalPanel, tastePanel]);

  const bottomTabs = useMemo(() => [
    { id: "agent", icon: "💬", label: "Agent Chat", content: agentPanel },
    { id: "console", icon: "🛠️", label: "Build Console", content: <BuildConsole logs={buildLogs} onClear={() => useBuildLogStore.getState().clearLogs()} /> },
    { id: "problems", icon: "⚠️", label: "Problems", content: <div style={{ padding: 12, color: "var(--jb-text-muted)" }}>No problems detected.</div> },
    { id: "build", icon: "▶️", label: "Build Plan", content: buildPanel },
  ], [agentPanel, buildLogs, buildPanel]);

  const statusBar = (
    <StatusBar
      wsConnected={wsConnected}
      wsReconnecting={wsReconnecting}
      isPlaying={transport.isPlaying}
      status={status}
      hiveLoading={hiveLoading}
      hiveDegraded={!!hiveProposal?.degraded}
    />
  );

  return (
    <>
      <WorkbenchLayout
        topBar={topBar}
        leftTabs={leftTabs}
        rightTabs={rightTabs}
        bottomTabs={bottomTabs}
        center={center}
        statusBar={statusBar}
      />
      <SwarmField onEngine={setSwarmEngine} />
      <CommandPalette />
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
      <PublishDialog
        isOpen={showPublishDialog}
        onClose={() => setShowPublishDialog(false)}
        defaultTitle={projectName}
        defaultBpm={Math.round(transport.bpm)}
        defaultGenre="techno"
        audioBlob={publishAudioBlob}
        durationSecs={publishDuration}
      />
      <ExploreDialog isOpen={showExploreDialog} onClose={() => setShowExploreDialog(false)} />
    </>
  );
}

export default JetBeeApp;
