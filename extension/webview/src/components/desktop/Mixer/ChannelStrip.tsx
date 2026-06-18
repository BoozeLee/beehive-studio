import React, { useRef, useEffect, useCallback, useState } from "react";
import type { Track, TrackEffect, TrackEffectType } from "../../../lib/desktopTypes";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  meter: "#4ade80",
  meterPeak: "#fbbf24",
  meterClip: "#ef4444",
};

interface SendBus {
  id: string;
  name: string;
  level: number;
}

interface ChannelStripProps {
  track: Track;
  isSelected: boolean;
  buses: SendBus[];
  onSelect: () => void;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmToggle: () => void;
  onSendChange?: (busId: string, level: number) => void;
  onAddEffect?: (type: TrackEffectType) => void;
  onUpdateEffect?: (effectId: string, params: Partial<TrackEffect["params"]>, bypass: boolean) => void;
  onRemoveEffect?: (effectId: string) => void;
  level?: number;
  peak?: number;
}

const EFFECT_LABELS: Record<TrackEffectType, string> = {
  reverb: "Reverb",
  delay: "Delay",
  filter: "Filter",
  distortion: "Distortion",
};

export const ChannelStrip: React.FC<ChannelStripProps> = ({
  track,
  isSelected,
  buses,
  onSelect,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmToggle,
  onSendChange,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
  level = 0,
  peak = 0,
}) => {
  const meterRef = useRef<HTMLCanvasElement>(null);
  const [fxOpen, setFxOpen] = useState(false);

  const drawMeter = useCallback(() => {
    const canvas = meterRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const h = canvas.height;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, h);

    const levelHeight = Math.min(level, 1) * h;
    const peakY = h - Math.min(peak, 1) * h;

    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, COLORS.meter);
    gradient.addColorStop(0.7, COLORS.meter);
    gradient.addColorStop(0.85, COLORS.meterPeak);
    gradient.addColorStop(1, COLORS.meterClip);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, h - levelHeight, w, levelHeight);

    ctx.fillStyle = peak > 0.85 ? COLORS.meterClip : COLORS.meterPeak;
    ctx.fillRect(0, peakY, w, 2);
  }, [level, peak]);

  useEffect(() => {
    drawMeter();
  }, [drawMeter]);

  const trackTypeColor = {
    midi: "#ff8c42",
    audio: "#4ade80",
    drum: "#ef4444",
    bass: "#60a5fa",
    synth: "#a78bfa",
    sampler: "#f472b6",
    group: "#3b82f6",
    return: "#8b5cf6",
    master: "#f59e0b",
  }[track.type] || COLORS.textMuted;

  const sends = track.sends ?? {};

  return (
    <div
      data-testid={`channel-strip-${track.id}`}
      onClick={onSelect}
      style={{
        width: 92,
        padding: "6px 4px",
        background: isSelected ? `${trackTypeColor}11` : COLORS.panel,
        border: `1px solid ${isSelected ? trackTypeColor : COLORS.border}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        cursor: "pointer",
        opacity: track.muted ? 0.5 : 1,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: track.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 9,
          color: COLORS.text,
          fontWeight: isSelected ? 600 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 80,
          textAlign: "center",
        }}
      >
        {track.name}
      </span>

      <canvas
        ref={meterRef}
        data-testid={`channel-meter-${track.id}`}
        aria-label={`${track.name} level meter`}
        width={8}
        height={80}
        style={{
          width: 8,
          height: 80,
          borderRadius: 2,
          background: COLORS.bg,
        }}
      />

      <input
        aria-label={`${track.name} volume`}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={track.volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        style={{ width: 80, accentColor: trackTypeColor }}
        title={`Vol: ${(track.volume * 100).toFixed(0)}%`}
      />

      <input
        aria-label={`${track.name} pan`}
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={track.pan}
        onChange={(e) => onPanChange(parseFloat(e.target.value))}
        style={{ width: 80, accentColor: "#888" }}
        title={`Pan: ${track.pan > 0 ? `R${(track.pan * 100).toFixed(0)}` : track.pan < 0 ? `L${(-track.pan * 100).toFixed(0)}` : "C"}`}
      />

      <div style={{ display: "flex", gap: 2 }}>
        <MiniBtn label="M" ariaLabel={`${track.name} mute`} active={track.muted} activeColor={COLORS.meterClip} onClick={onMuteToggle} />
        <MiniBtn label="S" ariaLabel={`${track.name} solo`} active={track.solo} activeColor={COLORS.meterPeak} onClick={onSoloToggle} />
        <MiniBtn label="R" ariaLabel={`${track.name} arm`} active={track.arm} activeColor={COLORS.meterClip} onClick={onArmToggle} />
      </div>

      {/* Sends */}
      {buses.map((bus) => (
        <label
          key={bus.id}
          style={{
            fontSize: 9,
            color: COLORS.textMuted,
            display: "flex",
            alignItems: "center",
            gap: 2,
            width: "100%",
            justifyContent: "space-between",
          }}
        >
          {bus.name}
          <input
            aria-label={`${track.name} ${bus.name} send`}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sends[bus.id] ?? bus.level}
            onChange={(e) => onSendChange?.(bus.id, parseFloat(e.target.value))}
            style={{ width: 50 }}
          />
        </label>
      ))}

      {/* FX section */}
      <div style={{ width: "100%", borderTop: `1px solid ${COLORS.border}`, paddingTop: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFxOpen((v) => !v);
          }}
          style={{
            width: "100%",
            padding: "2px 4px",
            fontSize: 9,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.bg,
            color: COLORS.textMuted,
            cursor: "pointer",
          }}
        >
          FX {fxOpen ? "▲" : "▼"} ({track.effects?.length ?? 0})
        </button>
        {fxOpen && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
            {(track.effects ?? []).map((effect) => (
              <EffectControl
                key={effect.id}
                effect={effect}
                onChange={(params, bypass) => onUpdateEffect?.(effect.id, params, bypass)}
                onRemove={() => onRemoveEffect?.(effect.id)}
              />
            ))}
            {onAddEffect && (
              <select
                aria-label="+ Add FX"
                value=""
                onChange={(e) => {
                  if (e.target.value) onAddEffect(e.target.value as TrackEffectType);
                  e.target.value = "";
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  padding: "2px 4px",
                  fontSize: 9,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  background: COLORS.bg,
                  color: COLORS.text,
                }}
              >
                <option value="">+ Add FX</option>
                <option value="reverb">Reverb</option>
                <option value="delay">Delay</option>
                <option value="filter">Filter</option>
                <option value="distortion">Distortion</option>
              </select>
            )}
          </div>
        )}
      </div>

      <span style={{ fontSize: 8, color: COLORS.textMuted }}>
        {(track.volume * 100).toFixed(0)}%
      </span>
      <span style={{ fontSize: 8, color: COLORS.textMuted }}>
        L {(level * 100).toFixed(0)} P {(peak * 100).toFixed(0)}
      </span>
    </div>
  );
};

function EffectControl({
  effect,
  onChange,
  onRemove,
}: {
  effect: TrackEffect;
  onChange?: (params: Partial<TrackEffect["params"]>, bypass: boolean) => void;
  onRemove?: () => void;
}) {
  const params = effect.params;
  const update = (key: string, value: number) => {
    onChange?.({ ...params, [key]: value }, effect.bypass ?? false);
  };

  return (
    <div
      style={{
        padding: 4,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        background: COLORS.bg,
        opacity: effect.bypass ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: COLORS.text }}>{EFFECT_LABELS[effect.type]}</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(params, !effect.bypass);
            }}
            style={{
              padding: "1px 4px",
              fontSize: 8,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              background: effect.bypass ? "transparent" : COLORS.accent,
              color: effect.bypass ? COLORS.textMuted : "#000",
            }}
          >
            B
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            style={{
              padding: "1px 4px",
              fontSize: 8,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              background: "transparent",
              color: "#ff9a9a",
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        {effect.type === "reverb" && (
          <>
            <ParamSlider label="Decay" value={params.decay ?? 2} min={0.1} max={10} step={0.1} onChange={(v) => update("decay", v)} />
            <ParamSlider label="Wet" value={params.wet ?? 0.3} min={0} max={1} step={0.01} onChange={(v) => update("wet", v)} />
          </>
        )}
        {effect.type === "delay" && (
          <>
            <ParamSlider label="Time" value={params.delayTime ?? 0.375} min={0.01} max={1} step={0.01} onChange={(v) => update("delayTime", v)} />
            <ParamSlider label="Fdbk" value={params.feedback ?? 0.3} min={0} max={0.95} step={0.01} onChange={(v) => update("feedback", v)} />
            <ParamSlider label="Wet" value={params.wet ?? 0.25} min={0} max={1} step={0.01} onChange={(v) => update("wet", v)} />
          </>
        )}
        {effect.type === "filter" && (
          <>
            <ParamSlider label="Freq" value={params.frequency ?? 2000} min={20} max={20000} step={10} onChange={(v) => update("frequency", v)} />
            <ParamSlider label="Q" value={params.Q ?? 1} min={0.1} max={20} step={0.1} onChange={(v) => update("Q", v)} />
          </>
        )}
        {effect.type === "distortion" && (
          <>
            <ParamSlider label="Drive" value={params.distortion ?? 0.4} min={0} max={1} step={0.01} onChange={(v) => update("distortion", v)} />
            <ParamSlider label="Wet" value={params.wet ?? 0.2} min={0} max={1} step={0.01} onChange={(v) => update("wet", v)} />
          </>
        )}
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ fontSize: 8, color: COLORS.textMuted, display: "flex", alignItems: "center", gap: 2 }}>
      <span style={{ width: 28 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 40 }}
      />
    </label>
  );
}

function MiniBtn({
  label,
  ariaLabel,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 18,
        height: 18,
        fontSize: 8,
        fontWeight: 700,
        border: `1px solid ${active ? activeColor : COLORS.border}`,
        borderRadius: 3,
        background: active ? activeColor : "transparent",
        color: active ? "#000" : COLORS.textMuted,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}
