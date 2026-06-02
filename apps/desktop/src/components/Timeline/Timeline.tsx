import React, { useRef, useCallback, useMemo, useState } from "react";
import { TrackHeader } from "./TrackHeader";
import { useTimelineStore } from "../../lib/timelineStore";

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

interface TimelineProps {
  isPlaying: boolean;
  currentBeat: number;
  onPlayClip?: (clipId: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  isPlaying,
  currentBeat,
  onPlayClip,
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
    updateClip,
    setZoom,
    setScrollOffset,
    setSnapToGrid,
  } = useTimelineStore();

  const lanesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const [dragState, setDragState] = useState<{
    clipId: string;
    startX: number;
    startBeat: number;
    trackId: string;
    offsetX: number;
  } | null>(null);

  const [resizeState, setResizeState] = useState<{
    clipId: string;
    edge: "left" | "right";
    startX: number;
    startBeat: number;
    duration: number;
  } | null>(null);

  const totalBeats = useMemo(() => {
    let max = 16;
    for (const clip of Object.values(clips)) {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    }
    return max;
  }, [clips]);

  const clipCount = Object.keys(clips).length;

  // Virtual scrolling: only render clips within visible viewport + buffer
  const visibleBeatRange = useMemo(() => {
    const viewportBeats = 60; // Default visible width in beats
    const startBeat = scrollOffset.x / zoom;
    const endBeat = startBeat + viewportBeats + 8; // 8 beat buffer
    return { start: Math.max(0, startBeat - 4), end: endBeat };
  }, [scrollOffset.x, zoom]);

  const totalWidth = totalBeats * zoom + 100;

  const handleScroll = useCallback(() => {
    if (lanesRef.current) {
      setScrollOffset({
        x: lanesRef.current.scrollLeft,
        y: lanesRef.current.scrollTop,
      });
    }
  }, [setScrollOffset]);

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, clipId: string, trackId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const clip = clips[clipId];
      if (!clip) return;

      setDragState({
        clipId,
        startX: e.clientX,
        startBeat: clip.start,
        trackId,
        offsetX: 0,
      });
      selectClip(clipId);
    },
    [clips, selectClip]
  );

  const handleClipResizeMouseDown = useCallback(
    (e: React.MouseEvent, clipId: string, edge: "left" | "right") => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const clip = clips[clipId];
      if (!clip) return;

      setResizeState({
        clipId,
        edge,
        startX: e.clientX,
        startBeat: clip.start,
        duration: clip.duration,
      });
    },
    [clips]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaBeat = deltaX / zoom;
        let newBeat = dragState.startBeat + deltaBeat;

        if (snapToGrid) {
          newBeat = Math.round(newBeat / gridDivision) * gridDivision;
        }
        newBeat = Math.max(0, newBeat);

        const clampedBeat = Math.round(newBeat * 100) / 100;
        updateClip(dragState.clipId, { start: clampedBeat });
      }

      if (resizeState) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaBeat = deltaX / zoom;

        if (resizeState.edge === "right") {
          let newDuration = resizeState.duration + deltaBeat;
          if (snapToGrid) {
            newDuration = Math.round(newDuration / gridDivision) * gridDivision;
          }
          newDuration = Math.max(0.25, newDuration);
          const clampedDuration = Math.round(newDuration * 100) / 100;
          updateClip(resizeState.clipId, { duration: clampedDuration });
        } else {
          let newStart = resizeState.startBeat + deltaBeat;
          let newDuration = resizeState.duration - deltaBeat;
          if (snapToGrid) {
            newStart = Math.round(newStart / gridDivision) * gridDivision;
            newDuration = Math.round(newDuration / gridDivision) * gridDivision;
          }
          if (newDuration >= 0.25 && newStart >= 0) {
            updateClip(resizeState.clipId, {
              start: Math.round(newStart * 100) / 100,
              duration: Math.round(newDuration * 100) / 100,
            });
          }
        }
      }
    },
    [dragState, resizeState, zoom, snapToGrid, gridDivision, updateClip]
  );

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    setResizeState(null);
  }, []);

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
    left: snapBeat(currentBeat) * zoom - scrollOffset.x,
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
        {clipCount > 100 && (
          <span style={{ fontSize: 10, color: COLORS.accent, marginLeft: 4 }}>
            {clipCount} clips
          </span>
        )}
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
            />
          ))}
        </div>

        {/* Scrollable Lanes */}
        <div
          ref={lanesRef}
          onScroll={handleScroll}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            flex: 1,
            overflow: "auto",
            position: "relative",
          }}
        >
          {/* Ruler */}
          <div
            style={{
              position: "sticky",
              top: 0,
              height: RULER_HEIGHT,
              width: totalWidth,
              background: COLORS.rulerBg,
              borderBottom: `1px solid ${COLORS.border}`,
              zIndex: 10,
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
                {track.clips
                  .filter((clipId: string) => {
                    const clip = clips[clipId];
                    if (!clip) return false;
                    const clipEnd = clip.start + clip.duration;
                    return clip.start <= visibleBeatRange.end && clipEnd >= visibleBeatRange.start;
                  })
                  .map((clipId: string) => {
                  const clip = clips[clipId];
                  if (!clip) return null;
                  const clipLeft = clip.start * zoom;
                  const clipWidth = Math.max(clip.duration * zoom, 8);
                  const isSelected = selectedClipId === clip.id;
                  const isDragging = dragState?.clipId === clipId;
                  const isResizing = resizeState?.clipId === clipId;

                  return (
                    <div
                      key={clip.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectClip(clip.id);
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip.id, track.id)}
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
                        cursor: isDragging || isResizing ? "grabbing" : "grab",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        padding: "0 6px",
                        boxSizing: "border-box",
                        transition: isDragging ? "none" : "opacity 0.15s",
                        zIndex: isDragging || isResizing ? 15 : 1,
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
{/* Left resize handle */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleClipResizeMouseDown(e, clip.id, "left");
                          }}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: 6,
                            height: "100%",
                            cursor: "ew-resize",
                            zIndex: 10,
                          }}
                        />
                      )}
                      {/* Right resize handle */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleClipResizeMouseDown(e, clip.id, "right");
                          }}
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            width: 6,
                            height: "100%",
                            cursor: "ew-resize",
                            zIndex: 10,
                          }}
                        />
                      )}
                    </div>
                      )}
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
