import { useState, useEffect, useCallback } from "react";
import {
  checkPublishHealth,
  signIn,
  signOut,
  getCurrentEmail,
  type PublishMetadata,
  type TrackInfo,
} from "../../lib/publishBridge";
import { publishTrack } from "../../api/mixhiveBridge";
import { BEEHIVE, buttonStyle } from "../../lib/theme";

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultBpm?: number;
  defaultKey?: string;
  defaultGenre?: string;
  /** The exported WAV audio blob to publish */
  audioBlob?: Blob | null;
  durationSecs?: number;
}

type Step = "checking" | "signin" | "publish" | "done";

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: 7,
  background: BEEHIVE.bg,
  color: BEEHIVE.text,
  border: `1px solid ${BEEHIVE.border}`,
  borderRadius: 4,
} as const;

export function PublishDialog({
  isOpen,
  onClose,
  defaultTitle,
  defaultBpm = 140,
  defaultKey,
  defaultGenre,
  audioBlob,
  durationSecs,
}: PublishDialogProps) {
  const [step, setStep] = useState<Step>("checking");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedTrack, setPublishedTrack] = useState<TrackInfo | null>(null);
  const [error, setError] = useState("");

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [bpm, setBpm] = useState(defaultBpm);
  const [key, setKey] = useState(defaultKey ?? "");
  const [genre, setGenre] = useState(defaultGenre ?? "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setPublishedTrack(null);
    setTitle(defaultTitle ?? "");
    setBpm(defaultBpm);
    (async () => {
      setStep("checking");
      const ok = await checkPublishHealth();
      setConfigured(ok);
      if (!ok) return;
      const current = await getCurrentEmail();
      if (current) {
        setSignedInAs(current);
        setStep("publish");
      } else {
        setStep("signin");
      }
    })();
  }, [isOpen, defaultTitle, defaultBpm]);

  const handleSignIn = useCallback(async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    try {
      setError("");
      await signIn(email.trim(), password);
      const current = await getCurrentEmail();
      setSignedInAs(current);
      setPassword("");
      setStep("publish");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [email, password]);

  const handlePublish = useCallback(async () => {
    if (!title.trim()) {
      setError("Track title is required");
      return;
    }
    if (!audioBlob) {
      setError("No audio data — export your project first");
      return;
    }
    try {
      setPublishing(true);
      setError("");

      const arrayBuffer = await audioBlob.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < buffer.byteLength; i++) {
        binary += String.fromCharCode(buffer[i]);
      }
      const base64Audio = window.btoa(binary);

      const result = await publishTrack({
        title: title.trim(),
        artist: signedInAs ?? "Anonymous",
        bpm,
        key: key || undefined,
        genre: genre || undefined,
        description: description.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        audioData: base64Audio,
      });
      
      setPublishedTrack({
        id: result.track_id,
        title: title.trim(),
        artistName: signedInAs ?? "Anonymous",
        artistHandle: signedInAs?.split("@")[0] ?? "anon",
        bpm,
        key: key ?? "",
        genre: genre ?? "",
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        isPublic: true,
        durationSecs: durationSecs ?? 0,
        audioUrl: result.url,
        alsUrl: "",
        createdAt: new Date().toISOString(),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }, [title, bpm, key, genre, description, tags, audioBlob, durationSecs, signedInAs]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !publishing) onClose();
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
        aria-labelledby="publish-title"
        style={{
          width: "min(500px, 100%)",
          background: BEEHIVE.panel,
          color: BEEHIVE.text,
          border: `1px solid ${BEEHIVE.border}`,
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: `1px solid ${BEEHIVE.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 id="publish-title" style={{ margin: 0, fontSize: 17 }}>
            Publish to MixHive
          </h2>
          {signedInAs && (
            <span style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
              {signedInAs}{" "}
              <button
                onClick={async () => {
                  await signOut();
                  setSignedInAs(null);
                  setStep("signin");
                }}
                style={{ background: "none", border: "none", color: BEEHIVE.comb, cursor: "pointer", fontSize: 11 }}
              >
                (sign out)
              </button>
            </span>
          )}
        </div>

        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          {step === "checking" && (
            <div style={{ color: BEEHIVE.textMuted, fontSize: 13 }}>Checking MixHive connection…</div>
          )}

          {configured === false && (
            <div style={{ color: BEEHIVE.error, fontSize: 13 }}>
              MixHive is not configured. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the desktop .env.
            </div>
          )}

          {step === "signin" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: BEEHIVE.textMuted }}>
                Sign in with your MixHive account to publish.
              </div>
              <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
              </label>
              <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <button onClick={handleSignIn} style={buttonStyle(BEEHIVE.comb, false)}>
                Sign in
              </button>
            </div>
          )}

          {step === "publish" && (
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                Track title *
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track name" style={inputStyle} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                  BPM
                  <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={inputStyle} />
                </label>
                <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                  Key
                  <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="G#m" style={inputStyle} />
                </label>
                <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                  Genre
                  <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="techno" style={inputStyle} />
                </label>
              </div>
              <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
              <label style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
                Tags (comma-separated)
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dark, rolling, techno" style={inputStyle} />
              </label>
              {!audioBlob && (
                <div style={{ color: BEEHIVE.warning, fontSize: 12 }}>No audio yet — export your project first.</div>
              )}
              <button
                onClick={handlePublish}
                disabled={publishing || !audioBlob}
                style={buttonStyle(BEEHIVE.comb, publishing || !audioBlob)}
              >
                {publishing ? "Publishing…" : "🌐 Publish to MixHive"}
              </button>
            </div>
          )}

          {step === "done" && publishedTrack && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: BEEHIVE.comb, fontSize: 14 }}>✓ Published “{publishedTrack.title}”</div>
              <a
                href={publishedTrack.audioUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: BEEHIVE.comb, fontSize: 12, wordBreak: "break-all" }}
              >
                {publishedTrack.audioUrl}
              </a>
              <button onClick={onClose} style={buttonStyle(BEEHIVE.comb, false)}>
                Done
              </button>
            </div>
          )}

          {error && <div style={{ color: BEEHIVE.error, fontSize: 12 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
