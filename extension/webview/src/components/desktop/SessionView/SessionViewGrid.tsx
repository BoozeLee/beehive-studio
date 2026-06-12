/**
 * SessionViewGrid — Clip launcher grid with agent-type color coding
 *
 * Displays generated clips in a grid with visual note density,
 * agent-type colors, and accept/reject/iterate controls.
 */

import { BEEHIVE } from "../../../lib/theme";
import { LikeButton } from "../TasteGraph/LikeButton";
import { extractFeatures } from "../TasteGraph/tasteFeatures";

interface Note {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

interface Clip {
  id: string;
  name: string;
  color?: string;
  midiData?: { notes: Note[] };
  reasoning?: string[];
  qa?: { pass?: boolean; score?: number; warnings?: string[] };
}

interface Props {
  clips: Clip[];
  projectId?: string;
  onPlayClip?: (clipId: string) => void;
  onAccept?: (clipId: string) => void;
  onReject?: (clipId: string) => void;
  onVariations?: (clipId: string) => void;
  onLaunchScene?: () => void;
}

const AGENT_COLORS: Record<string, string> = {
  rhythm: BEEHIVE.comb,
  groove: BEEHIVE.comb,
  bass: BEEHIVE.comb,
  melody: BEEHIVE.honey,
  harmony: "#6366f1",
  chords: "#6366f1",
  drum: "#ef4444",
  percussion: "#ef4444",
  arrangement: "#10b981",
  style: "#a855f7",
  texture: "#06b6d4",
  mix: "#f59e0b",
};

function inferClipColor(name: string, fallback?: string): string {
  if (fallback && fallback !== "#0f0f12") return fallback;
  const lower = name.toLowerCase();
  for (const [keyword, color] of Object.entries(AGENT_COLORS)) {
    if (lower.includes(keyword)) return color;
  }
  return BEEHIVE.comb;
}

function noteDensityBars(notes: Note[], totalDuration: number, divisions: number): number[] {
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

export function SessionViewGrid({
  clips,
  projectId,
  onPlayClip,
  onAccept,
  onReject,
  onVariations,
  onLaunchScene,
}: Props) {
  if (clips.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: BEEHIVE.textMuted,
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
          <p>No clips yet. Send a brief to an agent.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            Try: "142 BPM dark rolling psytrance bassline"
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 4px 8px" }}>
        <ActionBtn onClick={onLaunchScene} accent={BEEHIVE.comb}>
          Launch Scene
        </ActionBtn>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
        padding: 4,
      }}>
      {clips.map((clip) => {
        const color = inferClipColor(clip.name, clip.color);
        const notes = clip.midiData?.notes ?? [];
        const noteCount = notes.length;
        const duration = notes.length > 0
          ? Math.max(...notes.map((n) => n.start + n.duration))
          : 0;
        const density = noteDensityBars(notes, Math.max(duration, 4), 20);
        const qaScore = clip.qa?.score;
        const qaWarnings = clip.qa?.warnings ?? [];

        return (
          <div
            key={clip.id}
            style={{
              border: `1px solid ${BEEHIVE.border}`,
              borderRadius: 8,
              padding: 12,
              background: BEEHIVE.panel,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: BEEHIVE.text,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {clip.name}
              </span>
              {qaScore !== undefined && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: qaScore >= 65 ? `${BEEHIVE.success}22` : `${BEEHIVE.warning}22`,
                    color: qaScore >= 65 ? BEEHIVE.success : BEEHIVE.warning,
                  }}
                >
                  {qaScore.toFixed(0)}
                </span>
              )}
            </div>

            {/* Note density mini-visualizer */}
            {noteCount > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 1,
                  height: 24,
                  alignItems: "flex-end",
                  padding: "4px 0",
                }}
              >
                {density.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${Math.max(h * 100, 8)}%`,
                      background: color,
                      opacity: 0.5 + h * 0.5,
                      borderRadius: "1px 1px 0 0",
                      minHeight: 2,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Meta */}
            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 10,
                color: BEEHIVE.textMuted,
              }}
            >
              <span>{noteCount} notes</span>
              {duration > 0 && <span>{duration.toFixed(1)} beats</span>}
            </div>

            {/* QA Warnings */}
            {qaWarnings.length > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: BEEHIVE.warning,
                  background: `${BEEHIVE.warning}11`,
                  padding: "4px 8px",
                  borderRadius: 4,
                  lineHeight: 1.4,
                }}
              >
                {qaWarnings.slice(0, 2).map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            {/* Reasoning */}
            {clip.reasoning && clip.reasoning.length > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: BEEHIVE.textMuted,
                  lineHeight: 1.4,
                  maxHeight: 60,
                  overflow: "auto",
                }}
              >
                {clip.reasoning.slice(0, 2).map((r, i) => (
                  <div key={i} style={{ marginBottom: 2 }}>• {r}</div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto", alignItems: "center" }}>
              <ActionBtn onClick={() => onPlayClip?.(clip.id)} accent={color}>
                ▶ Play
              </ActionBtn>
              <ActionBtn onClick={() => onAccept?.(clip.id)}>
                ✓ Accept
              </ActionBtn>
              <ActionBtn onClick={() => onReject?.(clip.id)}>
                ✕ Reject
              </ActionBtn>
              {onVariations && (
                <ActionBtn onClick={() => onVariations(clip.id)}>
                  🔄 Iterate
                </ActionBtn>
              )}
              {projectId && (
                <LikeButton
                  payload={{
                    projectId,
                    clipId: clip.id,
                    verdict: "like",
                    label: clip.name,
                    featureVector: clip.midiData ? extractFeatures(clip.midiData.notes) : undefined,
                    tags: clip.name ? [clip.name.toLowerCase().split(" ")[0]] : [],
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  accent,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 4,
        border: `1px solid ${accent ?? BEEHIVE.border}`,
        background: accent ? `${accent}22` : "transparent",
        color: accent ?? BEEHIVE.text,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}
