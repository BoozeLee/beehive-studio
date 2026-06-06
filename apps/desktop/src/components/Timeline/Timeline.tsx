import React, { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { TrackHeader } from "./TrackHeader";
import { useTimelineStore } from "../../lib/timelineStore";
import type { Clip as TimelineClip } from "../../../../../packages/core-models/index";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  rulerBg: "#141418",
};

const TRACK_HEIGHT = 40;
const RULER_HEIGHT = 24;
const HEADER_WIDTH = 180;
const RESIZE_HANDLE_WIDTH = 8;

interface TimelineProps {
  isPlaying: boolean;
  currentBeat: number;
  bpm?: number;
  onPlayClip?: (clipId: string) => void;
  onSeek?: (beat: number) => void;
  onAddTrack?: () => void;
  onRemoveTrack?: (trackId: string) => void;
  onDeleteClip?: (clipId: string) => void;
  onDuplicateClip?: (clip: TimelineClip) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  isPlaying,
  currentBeat,
  bpm = 142,
  onPlayClip,
  onSeek,
  onAddTrack,
  onRemoveTrack,
  onDeleteClip,
  onDuplicateClip,
}) => {
  const {
    tracks,
    clips,
    selectedTrackId,
    selectedClipId,
    zoom,
    scrollOffset,
    snapToGrid,
    gridDivision,
    selectTrack,
    selectClip,
    updateTrack,
    moveClipToTrack,
    resizeClip,
    duplicateClip,
    splitClipAt,
    removeClip,
    setZoom,
    setScrollOffset,
    setSnapToGrid,
    setCursorPosition,
  } = useTimelineStore();

  const lanesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    type: "move" | "resize";
    clipId: string;
    startX: number;
    originalStart: number;
    originalDuration: number;
    originalTrackId: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
  } | null>(null);

  const totalBeats = useMemo(() => {
    let max = 16;
    for (const clip of Object.values(clips)) {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    }
    return Math.ceil(max / 4) * 4 + 4;
  }, [clips]);

  const totalWidth = totalBeats * zoom + 100;

  const handleScroll = useCallback(() => {
    if (lanesRef.current) {
      setScrollOffset({
        x: lanesRef.current.scrollLeft,
        y: lanesRef.current.scrollTop,
      });
    }
  }, [setScrollOffset]);

  const snapBeat = useCallback(
    (beat: number) => {
      if (!snapToGrid) return beat;
      const grid = gridDivision;
      return Math.round(beat / grid) * grid;
    },
    [snapToGrid, gridDivision]
  );

  const playheadStyle: React.CSSProperties = {
    position: "absolute",
    left: (isPlaying ? currentBeat : snapBeat(currentBeat)) * zoom - scrollOffset.x,
    top: 0,
    width: 2,
    height: tracks.length * TRACK_HEIGHT + RULER_HEIGHT,
    background: COLORS.accent,
    zIndex: 20,
    pointerEvents: "none",
    transition: isPlaying ? "none" : "left 0.3s ease",
  };

  const rulerMarks = useMemo(() => {
    const marks: Array<{ beat: number; label: string; isBar: boolean }> = [];
    for (let b = 0; b <= totalBeats; b++) {
      if (b % 4 === 0) {
        marks.push({ beat: b, label: `${b / 4 + 1}`, isBar: true });
      } else if (b % 1 === 0) {
        marks.push({ beat: b, label: "", isBar: false });
      }
    }
    return marks;
  }, [totalBeats]);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !lanesRef.current) return;
      const rect = lanesRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + lanesRef.current.scrollLeft;
      const beat = x / zoom;
      const snappedBeat = snapBeat(beat);
      setCursorPosition(snappedBeat);
      onSeek(snappedBeat);
    },
    [onSeek, zoom, snapBeat, setCursorPosition]
  );

  const getTrackIdFromPointer = useCallback(
    (clientY: number) => {
      if (!lanesRef.current || tracks.length === 0) return null;
      const rect = lanesRef.current.getBoundingClientRect();
      const y = clientY - rect.top + lanesRef.current.scrollTop - RULER_HEIGHT;
      const trackIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
      return tracks[trackIndex]?.id ?? null;
    },
    [tracks]
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dxBeats = (e.clientX - dragState.startX) / zoom;
      if (dragState.type === "move") {
        const nextTrackId = getTrackIdFromPointer(e.clientY) ?? dragState.originalTrackId;
        moveClipToTrack(
          dragState.clipId,
          nextTrackId,
          snapBeat(dragState.originalStart + dxBeats)
        );
      } else {
        resizeClip(dragState.clipId, snapBeat(dragState.originalDuration + dxBeats));
      }
    };

    const handleMouseUp = () => setDragState(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, getTrackIdFromPointer, moveClipToTrack, resizeClip, snapBeat, zoom]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [contextMenu]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
      }}
    >
      {contextMenu && (
        <div
          role="menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 100,
            minWidth: 130,
            padding: 4,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            background: COLORS.panel,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              const duplicatedId = duplicateClip(contextMenu.clipId);
              if (duplicatedId) {
                const duplicatedClip = useTimelineStore.getState().clips[duplicatedId];
                if (duplicatedClip) onDuplicateClip?.(duplicatedClip);
              }
              setContextMenu(null);
            }}
            style={menuItemStyle}
          >
            Duplicate
          </button>
          <button
            role="menuitem"
            onClick={() => {
              removeClip(contextMenu.clipId);
              onDeleteClip?.(contextMenu.clipId);
              setContextMenu(null);
            }}
            style={{ ...menuItemStyle, color: "#ff9a9a" }}
          >
            Delete
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const createdId = splitClipAt(contextMenu.clipId, currentBeat, 60 / bpm);
              if (createdId) {
                const createdClip = useTimelineStore.getState().clips[createdId];
                if (createdClip) onDuplicateClip?.(createdClip);
              }
              setContextMenu(null);
            }}
            style={menuItemStyle}
          >
            Split at Playhead
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
        }}
      >
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Timeline</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setZoom(zoom * 1.25)}
          style={zoomBtnStyle}
          title="Zoom in"
        >
          +
        </button>
        <span style={{ fontSize: 10, color: COLORS.textMuted, minWidth: 40 }}>
          {zoom.toFixed(0)}px/beat
        </span>
        <button
          onClick={() => setZoom(zoom / 1.25)}
          style={zoomBtnStyle}
          title="Zoom out"
        >
          −
        </button>
        <div style={{ width: 1, height: 16, background: COLORS.border }} />
        <button
          onClick={() => setSnapToGrid(!snapToGrid)}
          style={{
            ...zoomBtnStyle,
            background: snapToGrid ? COLORS.accent : "transparent",
            color: snapToGrid ? "#000" : COLORS.textMuted,
          }}
          title="Toggle snap to grid"
        >
          ║
        </button>
        <div style={{ width: 1, height: 16, background: COLORS.border }} />
        <button
          onClick={onAddTrack}
          style={zoomBtnStyle}
          title="Add track"
        >
          +T
        </button>
      </div>

      {/* Ruler + Lanes */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Track Headers */}
        <div
          style={{
            width: HEADER_WIDTH,
            flexShrink: 0,
            borderRight: `1px solid ${COLORS.border}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: RULER_HEIGHT,
              borderBottom: `1px solid ${COLORS.border}`,
              background: COLORS.rulerBg,
            }}
          />
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              isSelected={selectedTrackId === track.id}
              onSelect={() => selectTrack(track.id)}
              onToggleMute={() =>
                updateTrack(track.id, { muted: !track.muted })
              }
              onToggleSolo={() =>
                updateTrack(track.id, { solo: !track.solo })
              }
              onToggleArm={() =>
                updateTrack(track.id, { arm: !track.arm })
              }
              onRemove={onRemoveTrack ? () => onRemoveTrack(track.id) : undefined}
            />
          ))}
        </div>

        {/* Scrollable Lanes */}
        <div
          ref={lanesRef}
          data-testid="timeline-lanes"
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflow: "auto",
            position: "relative",
          }}
        >
          {/* Ruler */}
          <div
            data-testid="timeline-ruler"
            onClick={handleRulerClick}
            style={{
              position: "sticky",
              top: 0,
              height: RULER_HEIGHT,
              width: totalWidth,
              background: COLORS.rulerBg,
              borderBottom: `1px solid ${COLORS.border}`,
              zIndex: 10,
              cursor: onSeek ? "pointer" : "default",
            }}
          >
            {rulerMarks.map((mark) => (
              <div
                key={mark.beat}
                style={{
                  position: "absolute",
                  left: mark.beat * zoom,
                  top: 0,
                  width: 1,
                  height: mark.isBar ? RULER_HEIGHT : RULER_HEIGHT / 2,
                  background: mark.isBar
                    ? COLORS.border
                    : "rgba(255,255,255,0.08)",
                }}
              >
                {mark.isBar && (
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 4,
                      fontSize: 10,
                      color: COLORS.textMuted,
                    }}
                  >
                    {mark.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Track Lanes */}
          <div style={{ position: "relative", width: totalWidth, minHeight: tracks.length * TRACK_HEIGHT }}>
            {tracks.map((track, trackIdx) => (
              <div
                key={track.id}
                style={{
                  position: "relative",
                  height: TRACK_HEIGHT,
                  width: totalWidth,
                  borderBottom: `1px solid ${COLORS.border}`,
                  background:
                    selectedTrackId === track.id
                      ? "rgba(255,140,66,0.04)"
                      : trackIdx % 2 === 0
                      ? "rgba(255,255,255,0.02)"
                      : "transparent",
                }}
              >
                {/* Grid lines */}
                {rulerMarks
                  .filter((m) => m.isBar)
                  .map((mark) => (
                    <div
                      key={mark.beat}
                      style={{
                        position: "absolute",
                        left: mark.beat * zoom,
                        top: 0,
                        width: 1,
                        height: TRACK_HEIGHT,
                        background: "rgba(255,255,255,0.04)",
                        pointerEvents: "none",
                      }}
                    />
                  ))}

                {/* Clips in this track */}
                {track.clips.map((clipId: string) => {
                  const clip = clips[clipId];
                  if (!clip) return null;
                  const clipLeft = clip.start * zoom;
                  const clipWidth = Math.max(clip.duration * zoom, 8);
                  const isSelected = selectedClipId === clip.id;

                  return (
                    <div
                      key={clip.id}
                      data-testid={`timeline-clip-${clip.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectClip(clip.id);
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        selectClip(clip.id);
                        setContextMenu(null);
                        setDragState({
                          type: "move",
                          clipId: clip.id,
                          startX: e.clientX,
                          originalStart: clip.start,
                          originalDuration: clip.duration,
                          originalTrackId: track.id,
                        });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectClip(clip.id);
                        setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id });
                      }}
                      onDoubleClick={() => onPlayClip?.(clip.id)}
                      style={{
                        position: "absolute",
                        left: clipLeft,
                        top: 4,
                        width: clipWidth - 2,
                        height: TRACK_HEIGHT - 8,
                        borderRadius: 4,
                        background: clip.color || COLORS.accent,
                        opacity: track.muted ? 0.4 : 0.85,
                        border: isSelected
                          ? `2px solid ${COLORS.accent}`
                          : "2px solid transparent",
                        cursor: dragState?.clipId === clip.id ? "grabbing" : "grab",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        padding: "0 6px",
                        boxSizing: "border-box",
                        transition: "opacity 0.15s",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#000",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          lineHeight: 1.2,
                        }}
                      >
                        {clip.name}
                      </span>
                      {/* Mini MIDI note density */}
                      {clip.midiData?.notes && clip.midiData.notes.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: 1,
                            marginTop: 2,
                            height: 10,
                            alignItems: "flex-end",
                          }}
                        >
                          {noteDensityBars(
                            clip.midiData.notes,
                            clip.duration,
                            20
                          ).map((h, i) => (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                height: `${Math.max(h * 100, 10)}%`,
                                background: "rgba(0,0,0,0.3)",
                                borderRadius: "1px 1px 0 0",
                              }}
                            />
                          ))}
                        </div>
                      )}
                      <div
                        data-testid={`timeline-clip-${clip.id}-resize`}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          selectClip(clip.id);
                          setContextMenu(null);
                          setDragState({
                            type: "resize",
                            clipId: clip.id,
                            startX: e.clientX,
                            originalStart: clip.start,
                            originalDuration: clip.duration,
                            originalTrackId: track.id,
                          });
                        }}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                          width: RESIZE_HANDLE_WIDTH,
                          height: "100%",
                          cursor: "ew-resize",
                          background: isSelected ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.1)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Playhead */}
            <div ref={playheadRef} style={playheadStyle}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: COLORS.accent,
                  borderRadius: "0 0 4px 4px",
                  margin: "-1px 0 0 -4px",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function noteDensityBars(
  notes: Array<{ start: number; duration: number; velocity?: number }>,
  totalDuration: number,
  divisions: number
): number[] {
  if (notes.length === 0) return Array(divisions).fill(0);
  const bucket = Array(divisions).fill(0);
  for (const note of notes) {
    const idx = Math.floor((note.start / totalDuration) * divisions);
    if (idx >= 0 && idx < divisions) {
      bucket[idx] += (note.velocity ?? 100) / 127;
    }
  }
  const max = Math.max(...bucket, 1);
  return bucket.map((v) => v / max);
}

const zoomBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  fontSize: 14,
  fontWeight: 700,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  background: "transparent",
  color: COLORS.text,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 9px",
  border: 0,
  borderRadius: 4,
  background: "transparent",
  color: COLORS.text,
  textAlign: "left",
  fontSize: 12,
  cursor: "pointer",
};
