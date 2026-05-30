import React, { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getSampleMeta, playSamplePreview, type SampleInfo } from "../../lib/sampleCache";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

interface SampleBrowserProps {
  onSampleSelect?: (path: string, info: SampleInfo) => void;
}

export const SampleBrowser: React.FC<SampleBrowserProps> = ({
  onSampleSelect,
}) => {
  const [samples, setSamples] = useState<
    Array<{ path: string; info: SampleInfo | null }>
  >([]);
  const [loading, setLoading] = useState(false);

  const handleBrowse = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Audio",
          extensions: ["wav", "mp3", "flac", "ogg", "aiff", "aif"],
        },
      ],
    });

    if (!selected) return;
    setLoading(true);

    const paths = Array.isArray(selected) ? selected : [selected];
    const entries: Array<{ path: string; info: SampleInfo | null }> = [];

    for (const path of paths) {
      try {
        const info = await getSampleMeta(path);
        entries.push({ path, info });
      } catch {
        entries.push({ path, info: null });
      }
    }

    setSamples((prev) => [...prev, ...entries]);
    setLoading(false);
  }, []);

  const handlePreview = useCallback((path: string) => {
    playSamplePreview(path);
  }, []);

  const handleSelect = useCallback(
    (path: string, info: SampleInfo | null) => {
      if (onSampleSelect && info) {
        onSampleSelect(path, info);
      }
    },
    [onSampleSelect]
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
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          Samples
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleBrowse}
          disabled={loading}
          style={{
            padding: "3px 10px",
            fontSize: 11,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.accent,
            color: "#000",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Loading..." : "Browse"}
        </button>
      </div>

      <div style={{ maxHeight: 200, overflow: "auto", padding: 4 }}>
        {samples.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              fontSize: 12,
              color: COLORS.textMuted,
              fontStyle: "italic",
            }}
          >
            Click Browse to load audio samples
          </div>
        )}
        {samples.map((sample, idx) => (
          <div
            key={`${sample.path}-${idx}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 4,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.background = COLORS.panel)
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.background = "transparent")
            }
          >
            <span
              style={{ fontSize: 11, color: COLORS.accent, cursor: "pointer" }}
              onClick={() => handlePreview(sample.path)}
            >
              ▶
            </span>
            <span
              style={{
                fontSize: 11,
                color: COLORS.text,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              onClick={() => handleSelect(sample.path, sample.info)}
            >
              {sample.info?.filename ?? sample.path.split("/").pop()}
            </span>
            {sample.info && (
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                {sample.info.duration_secs > 0
                  ? `${sample.info.duration_secs.toFixed(1)}s`
                  : "—"}
                · {sample.info.sample_rate}Hz
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};