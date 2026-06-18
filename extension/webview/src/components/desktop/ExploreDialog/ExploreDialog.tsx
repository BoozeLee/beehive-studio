import { useState, useEffect, useRef, useCallback } from "react";
import {
  listTracks,
  getTrackAudioBytes,
  type TrackInfo,
} from "../../../lib/publishBridge";
import { BEEHIVE, buttonStyle, panelStyle } from "../../../lib/theme";
import * as Tone from "tone";

interface ExploreDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewState = "list" | "detail";

export function ExploreDialog({ isOpen, onClose }: ExploreDialogProps) {
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewState>("list");
  const [selectedTrack, setSelectedTrack] = useState<TrackInfo | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const playerRef = useRef<Tone.Player | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const fetchTracks = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    setError("");
    try {
      const result = searchQuery
        ? await listTracks({ q: searchQuery, limit: 50 })
        : await listTracks({ limit: 50 });
      setTracks(result.tracks);
      setTotal(result.total);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchTracks();
  }, [isOpen, fetchTracks]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleSearch = useCallback(() => {
    fetchTracks(query || undefined);
  }, [query, fetchTracks]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const handlePlay = useCallback(
    async (track: TrackInfo, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (playingId === track.id) {
        if (playerRef.current) {
          playerRef.current.stop();
          playerRef.current.dispose();
          playerRef.current = null;
        }
        setPlayingId(null);
        return;
      }

      try {
        if (playerRef.current) {
          playerRef.current.stop();
          playerRef.current.dispose();
        }
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const bytes = await getTrackAudioBytes(track.id);
        const blob = new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
        blobUrlRef.current = URL.createObjectURL(blob);
        const player = new Tone.Player(blobUrlRef.current).toDestination();
        playerRef.current = player;
        await Tone.loaded();
        player.start();
        setPlayingId(track.id);
        player.onstop = () => setPlayingId(null);
      } catch (err) {
        setError(String(err));
      }
    },
    [playingId]
  );

  const handleSelectTrack = useCallback((track: TrackInfo) => {
    setSelectedTrack(track);
    setView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setView("list");
    setSelectedTrack(null);
  }, []);

  const handleCopyUrl = useCallback((track: TrackInfo) => {
    const url = `${window.location.origin}/publish/track/${track.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(track.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDownloadAls = useCallback((track: TrackInfo) => {
    if (!track.alsUrl) return;
    const a = document.createElement("a");
    a.href = track.alsUrl;
    a.download = `${track.title}.als`;
    a.click();
  }, []);

  if (!isOpen) return null;

  const formatDuration = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
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
        aria-labelledby="explore-title"
        style={{
          width: "min(640px, 100%)",
          height: "min(80vh, 700px)",
          background: BEEHIVE.panel,
          color: BEEHIVE.text,
          border: `1px solid ${BEEHIVE.border}`,
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${BEEHIVE.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {view === "detail" ? (
            <button
              onClick={handleBack}
              style={{
                ...buttonStyle(BEEHIVE.smoke, false),
                padding: "4px 12px",
                fontSize: 12,
                color: BEEHIVE.text,
              }}
            >
              ← Back
            </button>
          ) : null}
          <h2 id="explore-title" style={{ margin: 0, fontSize: 17, flex: 1 }}>
            {view === "list" ? "MixHive Explore" : selectedTrack?.title ?? "Track"}
          </h2>
          <button
            onClick={onClose}
            style={{
              ...buttonStyle(BEEHIVE.smoke, false),
              padding: "4px 12px",
              fontSize: 12,
              color: BEEHIVE.text,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
          {view === "list" && (
            <>
              {/* Search bar */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search tracks by title, artist, or genre..."
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 13,
                    background: BEEHIVE.bg,
                    color: BEEHIVE.text,
                    border: `1px solid ${BEEHIVE.border}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={handleSearch}
                  style={{
                    ...buttonStyle(BEEHIVE.comb, false),
                    padding: "6px 16px",
                    fontSize: 13,
                  }}
                >
                  Search
                </button>
              </div>

              {/* Loading */}
              {loading && (
                <div style={{ color: BEEHIVE.textMuted, fontSize: 13 }}>
                  Loading tracks...
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  style={{
                    color: BEEHIVE.error,
                    fontSize: 12,
                    padding: 8,
                    background: "#2a1010",
                    borderRadius: 4,
                    marginBottom: 8,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && tracks.length === 0 && (
                <div style={{ color: BEEHIVE.textMuted, fontSize: 13, textAlign: "center", padding: 40 }}>
                  {query ? "No tracks match your search." : "No published tracks yet."}
                </div>
              )}

              {/* Track list */}
              {tracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => handleSelectTrack(track)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: BEEHIVE.bg,
                    borderRadius: 6,
                    marginBottom: 6,
                    cursor: "pointer",
                    border: `1px solid ${BEEHIVE.border}`,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = BEEHIVE.smoke;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = BEEHIVE.border;
                  }}
                >
                  <button
                    onClick={(e) => handlePlay(track, e)}
                    style={{
                      ...buttonStyle(playingId === track.id ? BEEHIVE.error : BEEHIVE.comb, false),
                      width: 32,
                      height: 32,
                      padding: 0,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    title={playingId === track.id ? "Stop" : "Preview"}
                  >
                    {playingId === track.id ? "■" : "▶"}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{track.title}</div>
                    <div style={{ color: BEEHIVE.textMuted, fontSize: 11 }}>
                      {track.artistName}
                      {track.genre ? ` · ${track.genre}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: BEEHIVE.wax }}>
                      {track.bpm} BPM
                    </div>
                    <div style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                      {track.key || "—"} · {formatDuration(track.durationSecs)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Total count */}
              {tracks.length > 0 && (
                <div style={{ color: BEEHIVE.textMuted, fontSize: 11, textAlign: "center", padding: 8 }}>
                  {tracks.length} of {total} tracks
                </div>
              )}
            </>
          )}

          {/* Detail view */}
          {view === "detail" && selectedTrack && (
            <div style={{ display: "grid", gap: 14 }}>
              <div
                style={{
                  ...panelStyle(),
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedTrack.title}</div>
                <div style={{ color: BEEHIVE.textMuted, fontSize: 13 }}>
                  by {selectedTrack.artistName}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    fontSize: 12,
                    padding: "10px 0",
                    borderTop: `1px solid ${BEEHIVE.border}`,
                    borderBottom: `1px solid ${BEEHIVE.border}`,
                  }}
                >
                  <div>
                    <span style={{ color: BEEHIVE.textMuted }}>BPM</span>
                    <br />
                    <span style={{ fontWeight: 600 }}>{selectedTrack.bpm}</span>
                  </div>
                  <div>
                    <span style={{ color: BEEHIVE.textMuted }}>Key</span>
                    <br />
                    <span style={{ fontWeight: 600 }}>{selectedTrack.key || "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: BEEHIVE.textMuted }}>Duration</span>
                    <br />
                    <span style={{ fontWeight: 600 }}>
                      {formatDuration(selectedTrack.durationSecs)}
                    </span>
                  </div>
                </div>

                {selectedTrack.genre && (
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: BEEHIVE.textMuted }}>Genre: </span>
                    {selectedTrack.genre}
                  </div>
                )}

                {selectedTrack.description && (
                  <div style={{ fontSize: 12, color: BEEHIVE.textMuted, lineHeight: 1.5 }}>
                    {selectedTrack.description}
                  </div>
                )}

                {selectedTrack.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedTrack.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: BEEHIVE.comb,
                          background: BEEHIVE.glow,
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(selectedTrack, e);
                    }}
                    style={{
                      ...buttonStyle(
                        playingId === selectedTrack.id ? BEEHIVE.error : BEEHIVE.comb,
                        false
                      ),
                      padding: "8px 20px",
                      fontSize: 13,
                    }}
                  >
                    {playingId === selectedTrack.id ? "■ Stop" : "▶ Play"}
                  </button>
                  <button
                    onClick={() => handleCopyUrl(selectedTrack)}
                    style={{
                      ...buttonStyle(BEEHIVE.wax, false),
                      padding: "8px 16px",
                      fontSize: 12,
                    }}
                  >
                    {copiedId === selectedTrack.id ? "✓ Copied!" : "Copy Share URL"}
                  </button>
                  {selectedTrack.alsUrl && (
                    <button
                      onClick={() => handleDownloadAls(selectedTrack)}
                      style={{
                        ...buttonStyle(BEEHIVE.smoke, false),
                        padding: "8px 16px",
                        fontSize: 12,
                        color: BEEHIVE.text,
                      }}
                    >
                      Download .als
                    </button>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    color: BEEHIVE.error,
                    fontSize: 12,
                    padding: 8,
                    background: "#2a1010",
                    borderRadius: 4,
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
