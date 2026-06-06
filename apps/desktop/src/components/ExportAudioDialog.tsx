import type { RenderPreset, RenderSummary } from "../lib/exportWorkflow";
import { formatRenderDuration, RENDER_PRESETS } from "../lib/exportWorkflow";
import { BEEHIVE, buttonStyle } from "../lib/theme";

interface ExportAudioDialogProps {
  isOpen: boolean;
  isExporting: boolean;
  preset: RenderPreset;
  progress: number;
  progressLabel: string;
  summary: RenderSummary;
  renderEngine: "python" | "desktop";
  outputMode: "master" | "master_and_stems";
  onPresetChange: (preset: RenderPreset) => void;
  onRenderEngineChange: (engine: "python" | "desktop") => void;
  onOutputModeChange: (mode: "master" | "master_and_stems") => void;
  onClose: () => void;
  onCancelExport?: () => void;
  onExport: (revealAfterSave: boolean) => void;
}

export function ExportAudioDialog({
  isOpen,
  isExporting,
  preset,
  progress,
  progressLabel,
  summary,
  renderEngine,
  outputMode,
  onPresetChange,
  onRenderEngineChange,
  onOutputModeChange,
  onClose,
  onCancelExport,
  onExport,
}: ExportAudioDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isExporting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.72)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-audio-title"
        style={{
          width: "min(520px, 100%)",
          background: BEEHIVE.panel,
          color: BEEHIVE.text,
          border: `1px solid ${BEEHIVE.border}`,
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 18, borderBottom: `1px solid ${BEEHIVE.border}` }}>
          <h2 id="export-audio-title" style={{ margin: 0, fontSize: 17 }}>
            Export Arrangement
          </h2>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {[
              ["Tracks", summary.trackCount],
              ["Clips", summary.clipCount],
              ["Notes", summary.noteCount],
              ["Length", formatRenderDuration(summary.durationSeconds)],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, background: BEEHIVE.bg, borderRadius: 4 }}>
                <div style={{ color: BEEHIVE.textMuted, fontSize: 10 }}>{label}</div>
                <div style={{ marginTop: 3, fontSize: 14, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          <fieldset disabled={isExporting} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: 8, color: BEEHIVE.textMuted, fontSize: 11 }}>
              Mastering preset
            </legend>
            <div style={{ display: "grid", gap: 6 }}>
              {(Object.entries(RENDER_PRESETS) as Array<
                [RenderPreset, (typeof RENDER_PRESETS)[RenderPreset]]
              >).map(([id, definition]) => (
                <label
                  key={id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    padding: 10,
                    border: `1px solid ${preset === id ? BEEHIVE.comb : BEEHIVE.border}`,
                    borderRadius: 4,
                    background: preset === id ? BEEHIVE.glow : BEEHIVE.bg,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="render-preset"
                    checked={preset === id}
                    onChange={() => onPresetChange(id)}
                  />
                  <span>
                    <strong style={{ display: "block", fontSize: 12 }}>{definition.label}</strong>
                    <span style={{ color: BEEHIVE.textMuted, fontSize: 10 }}>
                      {definition.description}
                    </span>
                  </span>
                  <span style={{ color: BEEHIVE.honey, fontSize: 11 }}>
                    {definition.targetLufs} LUFS
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
              Render engine
              <select
                value={renderEngine}
                disabled={isExporting}
                onChange={(event) =>
                  onRenderEngineChange(event.target.value as "python" | "desktop")
                }
                style={{ display: "block", width: "100%", marginTop: 4, padding: 7 }}
              >
                <option value="python">Python HQ (desktop fallback)</option>
                <option value="desktop">Desktop local</option>
              </select>
            </label>
            <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
              Output
              <select
                value={outputMode}
                disabled={isExporting}
                onChange={(event) =>
                  onOutputModeChange(event.target.value as "master" | "master_and_stems")
                }
                style={{ display: "block", width: "100%", marginTop: 4, padding: 7 }}
              >
                <option value="master">Master WAV</option>
                <option value="master_and_stems">Master + WAV stems</option>
              </select>
            </label>
          </div>

          {isExporting && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  color: BEEHIVE.textMuted,
                  fontSize: 11,
                }}
              >
                <span>{progressLabel}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div style={{ height: 6, background: BEEHIVE.bg, borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: "100%",
                    background: BEEHIVE.comb,
                    transition: "width 160ms ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: 14,
            borderTop: `1px solid ${BEEHIVE.border}`,
          }}
        >
          <button
            onClick={isExporting ? onCancelExport : onClose}
            disabled={isExporting && !onCancelExport}
            style={{
              ...buttonStyle(BEEHIVE.smoke, isExporting && !onCancelExport),
              color: BEEHIVE.text,
            }}
          >
            {isExporting ? "Cancel Render" : "Cancel"}
          </button>
          <button
            onClick={() => onExport(false)}
            disabled={isExporting || summary.clipCount === 0}
            style={buttonStyle(BEEHIVE.wax, isExporting || summary.clipCount === 0)}
          >
            Export
          </button>
          <button
            onClick={() => onExport(true)}
            disabled={isExporting || summary.clipCount === 0}
            style={buttonStyle(BEEHIVE.comb, isExporting || summary.clipCount === 0)}
          >
            Export and Reveal
          </button>
        </div>
      </div>
    </div>
  );
}
