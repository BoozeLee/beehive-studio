import React, { useState, useRef, useCallback, useEffect } from "react";
import { ChannelStrip } from "./ChannelStrip";
import { useTimelineStore } from "../../lib/timelineStore";
import type { Track } from "../../../../../packages/core-models/index";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

interface MixerProps {
  onVolumeChange?: (trackId: string, volume: number) => void;
  onPanChange?: (trackId: string, pan: number) => void;
}

export const Mixer: React.FC<MixerProps> = ({
  onVolumeChange,
  onPanChange,
}) => {
  const { tracks, selectedTrackId, selectTrack, updateTrack } =
    useTimelineStore();

  const [levels, setLevels] = useState<Record<string, number>>({});
  const rafRef = useRef<number>(0);

  // Simulated level metering — in production this reads from Web Audio analyser nodes
  useEffect(() => {
    const tick = () => {
      setLevels((prev) => {
        const next: Record<string, number> = {};
        for (const track of tracks) {
          if (track.muted) {
            next[track.id] = 0;
          } else {
            const base = prev[track.id] ?? 0;
            const target = track.volume * 0.4;
            const smoothed = base + (target - base) * 0.1;
            const noise = (Math.random() - 0.5) * 0.05;
            next[track.id] = Math.max(0, Math.min(1, smoothed + noise));
          }
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tracks]);

  const handleVolumeChange = useCallback(
    (trackId: string, volume: number) => {
      updateTrack(trackId, { volume });
      onVolumeChange?.(trackId, volume);
    },
    [updateTrack, onVolumeChange]
  );

  const handlePanChange = useCallback(
    (trackId: string, pan: number) => {
      updateTrack(trackId, { pan });
      onPanChange?.(trackId, pan);
    },
    [updateTrack, onPanChange]
  );

  const handleMuteToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (track) updateTrack(trackId, { muted: !track.muted });
    },
    [tracks, updateTrack]
  );

  const handleSoloToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (track) updateTrack(trackId, { solo: !track.solo });
    },
    [tracks, updateTrack]
  );

  const handleArmToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (track) updateTrack(trackId, { arm: !track.arm });
    },
    [tracks, updateTrack]
  );

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        overflow: "hidden",
      }}
    >
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
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Mixer</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>
          {tracks.length} track{tracks.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 8,
          overflowX: "auto",
          minHeight: 200,
        }}
      >
        {tracks.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: COLORS.textMuted,
              fontSize: 12,
            }}
          >
            Add tracks in the Timeline to see them here
          </div>
        )}

        {tracks.map((track: Track) => (
          <ChannelStrip
            key={track.id}
            track={track}
            isSelected={selectedTrackId === track.id}
            onSelect={() => selectTrack(track.id)}
            onVolumeChange={(v) => handleVolumeChange(track.id, v)}
            onPanChange={(p) => handlePanChange(track.id, p)}
            onMuteToggle={() => handleMuteToggle(track.id)}
            onSoloToggle={() => handleSoloToggle(track.id)}
            onArmToggle={() => handleArmToggle(track.id)}
            level={levels[track.id] ?? 0}
            peak={(levels[track.id] ?? 0) * 1.05}
          />
        ))}

        {/* Master channel */}
        <div
          style={{
            width: 80,
            padding: "6px 4px",
            background: COLORS.panel,
            border: `1px solid ${COLORS.accent}`,
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{ fontSize: 9, fontWeight: 700, color: COLORS.accent }}
          >
            MASTER
          </span>
          <div
            style={{
              width: "100%",
              height: 4,
              borderRadius: 2,
              background: "#4ade80",
              opacity: 0.6,
            }}
          />
          <span style={{ fontSize: 8, color: COLORS.textMuted }}>100%</span>
        </div>
      </div>
    </div>
  );
};