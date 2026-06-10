import { BEEHIVE } from "../../lib/theme";
import React from "react";
import {
  type EffectInstance,
  type EffectType,
  createEffect,
  EFFECT_LABELS,
  EFFECT_COLORS,
  EFFECT_PARAM_RANGE,
} from "../../lib/effectEngine";

const COLORS = BEEHIVE;

interface EffectsChainProps {
  effects: EffectInstance[];
  onChange: (effects: EffectInstance[]) => void;
}

export const EffectsChain: React.FC<EffectsChainProps> = ({
  effects,
  onChange,
}) => {
  const addEffect = (type: EffectType) => {
    onChange([...effects, createEffect(type)]);
  };

  const removeEffect = (id: string) => {
    onChange(effects.filter((fx) => fx.id !== id));
  };

  const toggleBypass = (id: string) => {
    onChange(
      effects.map((fx) =>
        fx.id === id ? { ...fx, bypass: !fx.bypass } : fx
      )
    );
  };

  const updateParam = (id: string, param: string, value: number) => {
    onChange(
      effects.map((fx) =>
        fx.id === id ? { ...fx, params: { ...fx.params, [param]: value } } : fx
      )
    );
  };

  const moveEffect = (id: string, direction: "up" | "down") => {
    const idx = effects.findIndex((fx) => fx.id === id);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= effects.length) return;
    const newEffects = [...effects];
    [newEffects[idx], newEffects[newIdx]] = [
      newEffects[newIdx],
      newEffects[idx],
    ];
    onChange(newEffects);
  };

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
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>FX Chain</span>
        <div style={{ flex: 1 }} />
        {(["reverb", "delay", "filter", "distortion"] as EffectType[]).map(
          (type) => (
            <button
              key={type}
              onClick={() => addEffect(type)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                border: `1px solid ${EFFECT_COLORS[type]}`,
                borderRadius: 3,
                background: "transparent",
                color: EFFECT_COLORS[type],
                cursor: "pointer",
              }}
            >
              + {EFFECT_LABELS[type]}
            </button>
          )
        )}
      </div>

      <div style={{ padding: 4, maxHeight: 240, overflow: "auto" }}>
        {effects.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              fontSize: 11,
              color: COLORS.textMuted,
            }}
          >
            No effects. Click + Reverb/Delay/Filter/Distortion to add.
          </div>
        )}
        {effects.map((fx, idx) => (
          <div
            key={fx.id}
            style={{
              margin: "4px 0",
              padding: 8,
              borderRadius: 6,
              background: fx.bypass
                ? "rgba(255,255,255,0.02)"
                : `${EFFECT_COLORS[fx.type]}11`,
              border: `1px solid ${fx.bypass ? COLORS.border : EFFECT_COLORS[fx.type]}44`,
              opacity: fx.bypass ? 0.5 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: EFFECT_COLORS[fx.type],
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.text,
                  flex: 1,
                }}
              >
                {EFFECT_LABELS[fx.type]}
              </span>
              <button
                onClick={() => moveEffect(fx.id, "up")}
                disabled={idx === 0}
                style={miniBtnStyle}
              >
                ↑
              </button>
              <button
                onClick={() => moveEffect(fx.id, "down")}
                disabled={idx === effects.length - 1}
                style={miniBtnStyle}
              >
                ↓
              </button>
              <button
                onClick={() => toggleBypass(fx.id)}
                style={{
                  ...miniBtnStyle,
                  background: fx.bypass ? COLORS.border : COLORS.accent,
                  color: fx.bypass ? COLORS.textMuted : "#000",
                }}
              >
                {fx.bypass ? "BYP" : "ON"}
              </button>
              <button
                onClick={() => removeEffect(fx.id)}
                style={{ ...miniBtnStyle, color: "#ef4444" }}
              >
                ×
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(EFFECT_PARAM_RANGE[fx.type] ?? {}).map(
                ([param, range]) => (
                  <label
                    key={param}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      fontSize: 10,
                      color: COLORS.textMuted,
                    }}
                  >
                    {range.label}
                    <input
                      type="range"
                      min={range.min}
                      max={range.max}
                      step={range.step}
                      value={fx.params[param] ?? range.min}
                      onChange={(e) =>
                        updateParam(fx.id, param, parseFloat(e.target.value))
                      }
                      style={{ width: 80 }}
                    />
                    <span style={{ fontSize: 9 }}>
                      {(fx.params[param] ?? range.min).toFixed(
                        range.step < 0.1 ? 3 : range.step < 1 ? 2 : 0
                      )}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const miniBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  fontSize: 10,
  padding: 0,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 3,
  background: "transparent",
  color: COLORS.textMuted,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};