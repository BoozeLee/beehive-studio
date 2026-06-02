import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GeneratedSample {
  type: string;
  path: string;
  duration: number;
}

const SAMPLE_TYPES = ["kick", "snare", "hihat", "clap", "tom", "fm_tone"];

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

interface SampleCuratorDialogProps {
  onImportSample?: (path: string, name: string) => void;
}

export const SampleCuratorDialog: React.FC<SampleCuratorDialogProps> = ({
  onImportSample,
}) => {
  const [brief, setBrief] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["kick"]);
  const [samples, setSamples] = useState<GeneratedSample[]>([]);
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewAudioCtx, setPreviewAudioCtx] = useState<AudioContext | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    if (selectedTypes.length === 0 || loading) return;

    setLoading(true);
    setReasoning([]);
    setSamples([]);

    try {
      const result = await invoke<{
        reasoning: string[];
        generated_samples: GeneratedSample[];
      }>("send_agent_request", {
        endpoint: "agents/sample_curator",
        body: {
          brief: brief || "Generate samples",
          generate_types: selectedTypes,
          session_context: { bpm: 140 },
        },
      });

      setReasoning(result.reasoning);
      setSamples(result.generated_samples || []);
    } catch (err) {
      setReasoning([`Error: ${String(err)}`]);
    } finally {
      setLoading(false);
    }
  }, [brief, selectedTypes, loading]);

  const handlePreview = useCallback(
    async (sample: GeneratedSample, index: number) => {
      if (playingIndex === index) {
        if (previewAudioCtx) {
          previewAudioCtx.close();
          setPreviewAudioCtx(null);
        }
        setPlayingIndex(null);
        return;
      }

      try {
        const ctx = new AudioContext();
        setPreviewAudioCtx(ctx);

        const bytes = await invoke<number[]>("read_file_bytes", {
          path: sample.path,
        });
        const arrayBuffer = new Uint8Array(bytes).buffer;
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start(0);
        setPlayingIndex(index);

        source.onended = () => {
          setPlayingIndex(null);
          ctx.close().catch(() => {});
          setPreviewAudioCtx(null);
        };
      } catch (err) {
        setReasoning((prev) => [...prev, `Preview error: ${String(err)}`]);
      }
    },
    [playingIndex, previewAudioCtx]
  );

  const handleImport = useCallback(
    (sample: GeneratedSample) => {
      if (onImportSample) {
        const name = `${sample.type}_${sample.duration.toFixed(1)}s`;
        onImportSample(sample.path, name);
      }
    },
    [onImportSample]
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
      {/* Header */}
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
          Sample Curator
        </span>
        <div style={{ flex: 1 }} />
      </div>

      {/* Query input */}
      <div style={{ padding: 8, display: "flex", gap: 6 }}>
        <input
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe samples (e.g. 'dark industrial kicks')"
          style={{
            flex: 1,
            padding: "6px 8px",
            fontSize: 12,
            background: COLORS.panel,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            outline: "none",
          }}
        />
      </div>

      {/* Type toggles */}
      <div
        style={{
          padding: "4px 8px",
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {SAMPLE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              background: selectedTypes.includes(type)
                ? COLORS.accent
                : "transparent",
              color: selectedTypes.includes(type) ? "#000" : COLORS.textMuted,
              cursor: "pointer",
            }}
          >
            {type}
          </button>
        ))}
        <button
          onClick={handleGenerate}
          disabled={loading || selectedTypes.length === 0}
          style={{
            marginLeft: "auto",
            padding: "3px 12px",
            fontSize: 10,
            fontWeight: 700,
            border: "none",
            borderRadius: 4,
            background: loading ? COLORS.border : COLORS.accent,
            color: loading ? COLORS.textMuted : "#000",
            cursor:
              loading || selectedTypes.length === 0
                ? "not-allowed"
                : "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Results */}
      <div style={{ maxHeight: 250, overflow: "auto", padding: 4 }}>
        {reasoning.length > 0 && (
          <div style={{ padding: "4px 8px", marginBottom: 4 }}>
            {reasoning.map((r, i) => (
              <div
                key={i}
                style={{
                  fontSize: 10,
                  color: COLORS.textMuted,
                  padding: "1px 0",
                }}
              >
                {r}
              </div>
            ))}
          </div>
        )}

        {samples.map((sample, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 4,
              margin: "2px 0",
              background: COLORS.panel,
            }}
          >
            <span
              onClick={() => handlePreview(sample, idx)}
              style={{
                fontSize: 11,
                color: playingIndex === idx ? COLORS.accent : COLORS.text,
                cursor: "pointer",
                padding: "2px 4px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 3,
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {playingIndex === idx ? "■" : "▶"}
            </span>
            <span style={{ fontSize: 11, color: COLORS.text, flex: 1 }}>
              {sample.type}
            </span>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>
              {sample.duration.toFixed(2)}s
            </span>
            <button
              onClick={() => handleImport(sample)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 3,
                background: "transparent",
                color: COLORS.textMuted,
                cursor: "pointer",
              }}
            >
              Import
            </button>
          </div>
        ))}

        {!loading && samples.length === 0 && reasoning.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              fontSize: 11,
              color: COLORS.textMuted,
              fontStyle: "italic",
            }}
          >
            Select sample types and click Generate
          </div>
        )}
      </div>
    </div>
  );
};
