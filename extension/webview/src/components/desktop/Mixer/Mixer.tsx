/**
 * Mixer — Channel strips with real Web Audio level metering, sends, effects, and master control
 */

import React, { useState, useCallback, useEffect } from "react";
import { ChannelStrip } from "./ChannelStrip";
import { useProjectStore } from "../../../stores/projectStore";
import {
  getAllChannelStates,
  getMasterState,
  setMasterGain,
  getSendBuses,
  updateChannel,
  addChannelEffect,
  updateChannelEffect,
  removeChannelEffect,
  updateMasterEq,
  setMasterLimiterThreshold,
  resetPeaks,
} from "../../../lib/audioMixer";
import type { Track, TrackEffect, TrackEffectType } from "../../../lib/desktopTypes";

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
  const { tracks, selectedTrackId, selectTrack, patchTrack } = useProjectStore();

  const [levels, setLevels] = useState<Record<string, number>>({});
  const [peaks, setPeaks] = useState<Record<string, number>>({});
  const [masterLevel, setMasterLevel] = useState(0);
  const [masterPeak, setMasterPeak] = useState(0);
  const [masterGain, setMasterGainState] = useState(0.9);
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
  const [limiterThreshold, setLimiterThreshold] = useState(-1);

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
      patchTrack(trackId, { volume });
      updateChannel(trackId, { volume });
      onVolumeChange?.(trackId, volume);
    },
    [patchTrack, onVolumeChange]
  );

  const handlePanChange = useCallback(
    (trackId: string, pan: number) => {
      patchTrack(trackId, { pan });
      updateChannel(trackId, { pan });
      onPanChange?.(trackId, pan);
    },
    [patchTrack, onPanChange]
  );

  const handleMuteToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (!track) return;
      const muted = !track.muted;
      patchTrack(trackId, { muted });
      updateChannel(trackId, { muted });
    },
    [tracks, patchTrack]
  );

  const handleSoloToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (!track) return;
      const solo = !track.solo;
      patchTrack(trackId, { solo });
      updateChannel(trackId, { solo });
    },
    [tracks, patchTrack]
  );

  const handleArmToggle = useCallback(
    (trackId: string) => {
      const track = tracks.find((t: Track) => t.id === trackId);
      if (!track) return;
      const arm = !track.arm;
      patchTrack(trackId, { arm });
      updateChannel(trackId, { armed: arm });
    },
    [tracks, patchTrack]
  );

  const handleSendChange = useCallback(
    (trackId: string, busId: string, level: number) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      const sends = { ...(track.sends ?? {}), [busId]: level };
      patchTrack(trackId, { sends });
      updateChannel(trackId, { fxReturns: { [busId]: level } });
    },
    [tracks, patchTrack]
  );

  const handleAddEffect = useCallback(
    (trackId: string, type: TrackEffectType) => {
      const defaults: Record<TrackEffectType, Partial<TrackEffect["params"]>> = {
        reverb: { decay: 2, wet: 0.3 },
        delay: { delayTime: 0.375, feedback: 0.3, wet: 0.25 },
        filter: { frequency: 2000, Q: 1 },
        distortion: { distortion: 0.4, wet: 0.2 },
      };
      const effect: TrackEffect = {
        id: crypto.randomUUID(),
        type,
        params: defaults[type] as Record<string, number>,
        bypass: false,
      };
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      patchTrack(trackId, { effects: [...(track.effects ?? []), effect] });
      addChannelEffect(trackId, effect);
    },
    [tracks, patchTrack]
  );

  const handleUpdateEffect = useCallback(
    (trackId: string, effectId: string, params: Partial<TrackEffect["params"]>, bypass: boolean) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      const effects = (track.effects ?? []).map((e) =>
        e.id === effectId
          ? ({ ...e, params: { ...e.params, ...params } as Record<string, number>, bypass } as TrackEffect)
          : e
      );
      patchTrack(trackId, { effects });
      updateChannelEffect(trackId, effectId, params, bypass);
    },
    [tracks, patchTrack]
  );

  const handleRemoveEffect = useCallback(
    (trackId: string, effectId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return;
      const effects = (track.effects ?? []).filter((e) => e.id !== effectId);
      patchTrack(trackId, { effects });
      removeChannelEffect(trackId, effectId);
    },
    [tracks, patchTrack]
  );

  const handleMasterGainChange = useCallback((gain: number) => {
    setMasterGainState(gain);
    setMasterGain(gain);
  }, []);

  const handleEqChange = useCallback(
    (band: "low" | "mid" | "high", value: number) => {
      const next = { ...eq, [band]: value };
      setEq(next);
      updateMasterEq(next.low, next.mid, next.high);
    },
    [eq]
  );

  const handleLimiterChange = useCallback((threshold: number) => {
    setLimiterThreshold(threshold);
    setMasterLimiterThreshold(threshold);
  }, []);

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
            buses={buses}
            onSelect={() => selectTrack(track.id)}
            onVolumeChange={(v) => handleVolumeChange(track.id, v)}
            onPanChange={(p) => handlePanChange(track.id, p)}
            onMuteToggle={() => handleMuteToggle(track.id)}
            onSoloToggle={() => handleSoloToggle(track.id)}
            onArmToggle={() => handleArmToggle(track.id)}
            onSendChange={(busId, level) => handleSendChange(track.id, busId, level)}
            onAddEffect={(type) => handleAddEffect(track.id, type)}
            onUpdateEffect={(effectId, params, bypass) =>
              handleUpdateEffect(track.id, effectId, params, bypass)
            }
            onRemoveEffect={(effectId) => handleRemoveEffect(track.id, effectId)}
            level={levels[track.id] ?? 0}
            peak={peaks[track.id] ?? 0}
          />
        ))}

        {/* Master channel */}
        <div
          data-testid="master-strip"
          style={{
            width: 100,
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
          <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.accent }}>MASTER</span>
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
                  masterLevel > 0.9 ? COLORS.warning : masterLevel > 0.7 ? COLORS.accent : COLORS.success,
                opacity: 0.7,
                transition: "height 0.05s linear",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: `${Math.min(masterPeak * 100, 100)}%`,
                left: 0,
                right: 0,
                height: 2,
                background: masterPeak > 0.95 ? "#ef4444" : "#fff",
                opacity: 0.8,
              }}
            />
          </div>
          <input
            aria-label="Master gain"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterGain}
            onChange={(e) => handleMasterGainChange(Number(e.target.value))}
            style={{ width: "100%", writingMode: "vertical-lr", height: 60 }}
          />
          <span style={{ fontSize: 8, color: COLORS.textMuted }}>{(masterGain * 100).toFixed(0)}%</span>

          {/* Master EQ */}
          <div style={{ width: "100%", borderTop: `1px solid ${COLORS.border}`, paddingTop: 4 }}>
            <span style={{ fontSize: 8, color: COLORS.textMuted }}>EQ</span>
            <ParamSlider label="Low" value={eq.low} min={-12} max={12} onChange={(v) => handleEqChange("low", v)} />
            <ParamSlider label="Mid" value={eq.mid} min={-12} max={12} onChange={(v) => handleEqChange("mid", v)} />
            <ParamSlider label="High" value={eq.high} min={-12} max={12} onChange={(v) => handleEqChange("high", v)} />
          </div>

          {/* Limiter */}
          <div style={{ width: "100%", borderTop: `1px solid ${COLORS.border}`, paddingTop: 4 }}>
            <span style={{ fontSize: 8, color: COLORS.textMuted }}>Limit</span>
            <ParamSlider
              label="Thr"
              value={limiterThreshold}
              min={-20}
              max={0}
              onChange={handleLimiterChange}
            />
          </div>

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

function ParamSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ fontSize: 8, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
      <span style={{ width: 20 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </label>
  );
}
