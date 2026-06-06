/**
 * Mixer — Channel strips with real Web Audio level metering and master control
 */

import React, { useState, useCallback, useEffect } from "react";
import { ChannelStrip } from "./ChannelStrip";
import { useTimelineStore } from "../../lib/timelineStore";
import {
  getAllChannelStates,
  getMasterState,
  setMasterGain,
  getSendBuses,
  setSendBusLevel,
  resetPeaks,
  updateChannel,
} from "../../lib/audioMixer";
import type { Track } from "../../../../../packages/core-models/index";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  success: "#4ade80",
  warning: "#fbbf24",
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
  const [peaks, setPeaks] = useState<Record<string, number>>({});
  const [masterLevel, setMasterLevel] = useState(0);
  const [masterPeak, setMasterPeak] = useState(0);
  const [masterGain, setMasterGainState] = useState(0.9);
  const [sendLevels, setSendLevels] = useState<Record<string, number>>({});

  // Real level metering from Web Audio analyser nodes
  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate < 1000 / 30) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastUpdate = timestamp;
      const states = getAllChannelStates();
      const nextLevels: Record<string, number> = {};
      const nextPeaks: Record<string, number> = {};
      for (const st of states) {
        nextLevels[st.id] = st.level;
        nextPeaks[st.id] = st.peak;
      }
      const master = getMasterState();
      setLevels(nextLevels);
      setPeaks(nextPeaks);
      setMasterLevel(master.level);
      setMasterPeak(master.peak);
      setMasterGainState(master.gain);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracks.length]);

  const buses = getSendBuses();

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

  const handleMasterGainChange = useCallback((gain: number) => {
    setMasterGainState(gain);
    setMasterGain(gain);
  }, []);

  const handleSendChange = useCallback((busId: string, level: number) => {
    if (selectedTrackId) {
      const track = tracks.find((item) => item.id === selectedTrackId);
      updateTrack(selectedTrackId, { sends: { ...track?.sends, [busId]: level } });
      updateChannel(selectedTrackId, { fxReturns: { [busId]: level } });
    } else {
      setSendBusLevel(busId, level);
    }
    setSendLevels((prev) => ({ ...prev, [busId]: level }));
  }, [selectedTrackId, tracks, updateTrack]);

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        overflow: "hidden",
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
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Mixer</span>
        <div style={{ flex: 1 }} />
        {buses.map((bus) => (
          <label
            key={bus.id}
            style={{
              fontSize: 10,
              color: COLORS.textMuted,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {bus.name}
            <input
              aria-label={`${bus.name} send level`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sendLevels[bus.id] ?? bus.level}
              onChange={(e) => handleSendChange(bus.id, Number(e.target.value))}
              style={{ width: 50 }}
            />
          </label>
        ))}
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
            peak={peaks[track.id] ?? 0}
          />
        ))}

        {/* Master channel */}
        <div
          data-testid="master-strip"
          style={{
            width: 80,
            padding: "6px 4px",
            background: COLORS.panel,
            border: `1px solid ${COLORS.accent}`,
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{ fontSize: 9, fontWeight: 700, color: COLORS.accent }}
          >
            MASTER
          </span>
          {/* Level meter */}
          <div
            style={{
              width: "100%",
              height: 80,
              background: "#111",
              borderRadius: 3,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: `${Math.min(masterLevel * 100, 100)}%`,
                background:
                  masterLevel > 0.9
                    ? COLORS.warning
                    : masterLevel > 0.7
                    ? COLORS.accent
                    : COLORS.success,
                opacity: 0.7,
                transition: "height 0.05s linear",
              }}
            />
            {/* Peak indicator */}
            <div
              style={{
                position: "absolute",
                bottom: `${Math.min(masterPeak * 100, 100)}%`,
                left: 0,
                right: 0,
                height: 2,
                background:
                  masterPeak > 0.95 ? "#ef4444" : "#fff",
                opacity: 0.8,
              }}
            />
          </div>
          {/* Master fader */}
          <input
            aria-label="Master gain"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterGain}
            onChange={(e) => handleMasterGainChange(Number(e.target.value))}
            style={{
              width: "100%",
              writingMode: "vertical-lr",
              height: 60,
            }}
          />
          <span style={{ fontSize: 8, color: COLORS.textMuted }}>
            {(masterGain * 100).toFixed(0)}%
          </span>
          <span style={{ fontSize: 8, color: COLORS.textMuted }}>
            L {(masterLevel * 100).toFixed(0)} P {(masterPeak * 100).toFixed(0)}
          </span>
          <button
            type="button"
            onClick={resetPeaks}
            style={{
              padding: "3px 5px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              background: "transparent",
              color: COLORS.textMuted,
              fontSize: 8,
              cursor: "pointer",
            }}
          >
            Reset Peaks
          </button>
        </div>
      </div>
    </div>
  );
};
