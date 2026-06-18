import { useCallback } from "react";
import { useTransportStore } from "../stores/transportStore";
import { useProjectStore } from "../stores/projectStore";
import { useTimelineStore } from "../stores/timelineStore";
import { Timeline } from "./desktop/Timeline/Timeline";
import { playClipImmediate } from "../lib/audioScheduler";
import { createChannel, removeChannel, updateChannel } from "../lib/audioMixer";
import type { Clip } from "../lib/desktopTypes";

const TRACK_COLORS = ["#ff8c42", "#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];

export function TimelinePage() {
  const { playing, currentBeat, bpm, seekToBeat } = useTransportStore();
  const {
    tracks,
    clips,
    selectedTrackId,
    selectedClipId,
    addTrack,
    removeTrack,
    patchTrack,
    moveClipToTrack,
    resizeClip,
    duplicateClip,
    splitClipAt,
    removeClip,
    selectTrack,
    selectClip,
  } = useProjectStore();
  const {
    zoom,
    scrollOffset,
    snapToGrid,
    gridDivision,
    cursorPosition,
    setZoom,
    setScrollOffset,
    setSnapToGrid,
    setCursorPosition,
  } = useTimelineStore();

  const { rescheduleIfPlaying } = useTransportStore();

  const handlePlayClip = useCallback(
    (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      const track = tracks.find((t) => t.id === clip?.trackId);
      if (clip && track) {
        playClipImmediate(clip, track, bpm);
      }
    },
    [clips, tracks, bpm]
  );

  const handleAddTrack = useCallback(() => {
    const id = crypto.randomUUID();
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const track = {
      id,
      name: `Track ${tracks.length + 1}`,
      type: "synth" as const,
      color,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      arm: false,
      clips: [],
      automationLanes: [],
      instrument: { type: "tonejs" as const, preset: "synth", settings: {} },
    };
    addTrack(track);
    createChannel(track.id, track.name);
    rescheduleIfPlaying();
  }, [tracks.length, addTrack, rescheduleIfPlaying]);

  const handleRemoveTrack = useCallback(
    (trackId: string) => {
      removeTrack(trackId);
      removeChannel(trackId);
      rescheduleIfPlaying();
    },
    [removeTrack, rescheduleIfPlaying]
  );

  const handleToggleMute = useCallback(
    (trackId: string, muted: boolean) => {
      patchTrack(trackId, { muted });
      updateChannel(trackId, { muted });
    },
    [patchTrack]
  );

  const handleToggleSolo = useCallback(
    (trackId: string, solo: boolean) => {
      patchTrack(trackId, { solo });
      updateChannel(trackId, { solo });
    },
    [patchTrack]
  );

  const handleToggleArm = useCallback(
    (trackId: string, arm: boolean) => {
      patchTrack(trackId, { arm });
      updateChannel(trackId, { armed: arm });
    },
    [patchTrack]
  );

  const handleMoveClip = useCallback(
    (clipId: string, trackId: string, start: number) => {
      moveClipToTrack(clipId, trackId, start);
      rescheduleIfPlaying();
    },
    [moveClipToTrack, rescheduleIfPlaying]
  );

  const handleResizeClip = useCallback(
    (clipId: string, duration: number) => {
      resizeClip(clipId, duration);
      rescheduleIfPlaying();
    },
    [resizeClip, rescheduleIfPlaying]
  );

  const handleDuplicateClip = useCallback(
    (clip: Clip) => {
      duplicateClip(clip.id);
      rescheduleIfPlaying();
    },
    [duplicateClip, rescheduleIfPlaying]
  );

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      removeClip(clipId);
      rescheduleIfPlaying();
    },
    [removeClip, rescheduleIfPlaying]
  );

  const handleSplitClip = useCallback(
    (clipId: string, beat: number) => {
      splitClipAt(clipId, beat);
      rescheduleIfPlaying();
    },
    [splitClipAt, rescheduleIfPlaying]
  );

  const handleSeek = useCallback(
    (beat: number) => {
      setCursorPosition(beat);
      seekToBeat(beat);
    },
    [seekToBeat, setCursorPosition]
  );

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Timeline
        isPlaying={playing}
        currentBeat={currentBeat}
        bpm={bpm}
        tracks={tracks}
        clips={clips}
        selectedTrackId={selectedTrackId}
        selectedClipId={selectedClipId}
        zoom={zoom}
        scrollOffset={scrollOffset}
        snapToGrid={snapToGrid}
        gridDivision={gridDivision}
        cursorPosition={cursorPosition}
        onSeek={handleSeek}
        onPlayClip={handlePlayClip}
        onAddTrack={handleAddTrack}
        onRemoveTrack={handleRemoveTrack}
        onToggleMute={handleToggleMute}
        onToggleSolo={handleToggleSolo}
        onToggleArm={handleToggleArm}
        onSelectTrack={(id) => selectTrack(id ?? undefined)}
        onSelectClip={(id) => selectClip(id ?? undefined)}
        onMoveClip={handleMoveClip}
        onResizeClip={handleResizeClip}
        onDuplicateClip={handleDuplicateClip}
        onDeleteClip={handleDeleteClip}
        onSplitClip={handleSplitClip}
        onZoomChange={setZoom}
        onScroll={setScrollOffset}
        onToggleSnap={() => setSnapToGrid(!snapToGrid)}
      />
    </div>
  );
}
