import React, { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getSampleMeta, playSamplePreview, stopSamplePreview, type SampleInfo } from "../../lib/sampleCache";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
};

interface SampleEntry {
  path: string;
  info: SampleInfo | null;
  waveformData?: Float32Array;
  loadingWaveform?: boolean;
}

interface SampleBrowserProps {
  onSampleSelect?: (path: string, info: SampleInfo) => void;
}

export const SampleBrowser: React.FC<SampleBrowserProps> = ({
  onSampleSelect,
}) => {
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const loadWaveform = useCallback(async (path: string): Promise<Float32Array | null> => {
    try {
      const ctx = getAudioContext();
      const response = await fetch(`asset://localhost/${path}`);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      const samples_100 = 100;
      const blockSize = Math.floor(channelData.length / samples_100);
      const waveform = new Float32Array(samples_100);
      for (let i = 0; i < samples_100; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        waveform[i] = sum / blockSize;
      }

      return waveform;
    } catch {
      return null;
    }
  }, [getAudioContext]);

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
    const entries: SampleEntry[] = [];

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
    if (playingPath === path) {
      stopSamplePreview();
      setPlayingPath(null);
    } else {
      if (playingPath) {
        stopSamplePreview();
      }
      playSamplePreview(path).catch(() => null);
      setPlayingPath(path);
    }
  }, [playingPath]);

  const handleSelect = useCallback(
    (path: string, info: SampleInfo | null) => {
      if (onSampleSelect && info) {
        onSampleSelect(path, info);
      }
    },
    [onSampleSelect]
  );

  const toggleExpand = useCallback((path: string) => {
    setExpandedPath((prev) => (prev === path ? null : path));
  }, []);

  useEffect(() => {
    const expandedEntry = samples.find((s) => s.path === expandedPath);
    if (expandedEntry && expandedPath && !expandedEntry.waveformData && !expandedEntry.loadingWaveform) {
      setSamples((prev) =>
        prev.map((s) =>
          s.path === expandedPath ? { ...s, loadingWaveform: true } : s
        )
      );
      loadWaveform(expandedPath).then((waveform) => {
        setSamples((prev) =>
          prev.map((s) =>
            s.path === expandedPath
              ? { ...s, waveformData: waveform ?? undefined, loadingWaveform: false }
              : s
          )
        );
      });
    }
  }, [expandedPath, samples, loadWaveform]);

  const renderWaveform = (waveform: Float32Array, width = 200, height = 24) => {
    const max = Math.max(...Array.from(waveform), 0.01);
    const pts = Array.from(waveform)
      .map((v: number, i: number) => {
        const x = (i / waveform.length) * width;
        const y = height - (v / max) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <polyline
          points={pts}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={1}
          opacity={0.8}
        />
      </svg>
    );
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

      <div style={{ maxHeight: 300, overflow: "auto", padding: 4 }}>
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
        {samples.map((sample, idx) => {
          const isExpanded = expandedPath === sample.path;
          const isPlaying = playingPath === sample.path;

          return (
            <div key={`${sample.path}-${idx}`}>
              <div
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
                  style={{
                    fontSize: 11,
                    color: isPlaying ? COLORS.accent : COLORS.text,
                    cursor: "pointer",
                    padding: "2px 4px",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 3,
                    minWidth: 24,
                    textAlign: "center",
                  }}
                  onClick={() => handlePreview(sample.path)}
                >
                  {isPlaying ? "■" : "▶"}
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
                  onDoubleClick={() => toggleExpand(sample.path)}
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
                <span
                  style={{ fontSize: 10, color: COLORS.textMuted, cursor: "pointer" }}
                  onClick={() => toggleExpand(sample.path)}
                >
                  {isExpanded ? "▼" : "▶"}
                </span>
              </div>

              {isExpanded && (
                <div
                  style={{
                    padding: "8px 12px 8px 44px",
                    background: COLORS.panel,
                    marginBottom: 4,
                    borderRadius: 4,
                  }}
                >
                  {sample.loadingWaveform ? (
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                      Loading waveform...
                    </span>
                  ) : sample.waveformData ? (
                    <div>
                      {renderWaveform(sample.waveformData, 200, 24)}
                      <div style={{ marginTop: 4, fontSize: 10, color: COLORS.textMuted }}>
                        {sample.waveformData.length} samples
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                      Waveform unavailable
                    </span>
                  )}
                  {sample.info && (
                    <div style={{ marginTop: 6, fontSize: 10, color: COLORS.textMuted }}>
                      <div>Channels: {sample.info.channels ?? "?"}</div>
                      <div>Sample Rate: {sample.info.sample_rate} Hz</div>
                      <div>Duration: {sample.info.duration_secs.toFixed(2)}s</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};