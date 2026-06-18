import { useEffect } from "react";
import { Mixer } from "./desktop/Mixer/Mixer";
import { AudioGraph } from "./desktop/Mixer/AudioGraph";
import { useProjectStore } from "../stores/projectStore";
import { initMixer, createChannel, setChannelEffects } from "../lib/audioMixer";

const COLORS = {
  textMuted: "#888",
};

export function MixerPage() {
  const tracks = useProjectStore((s) => s.tracks);

  useEffect(() => {
    initMixer();
    for (const track of tracks) {
      createChannel(track.id, track.name);
      if (track.effects && track.effects.length > 0) {
        setChannelEffects(track.id, track.effects);
      }
    }
  }, []);

  useEffect(() => {
    for (const track of tracks) {
      const created = createChannel(track.id, track.name);
      if (created && track.effects && track.effects.length > 0) {
        setChannelEffects(track.id, track.effects);
      }
    }
  }, [tracks]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 16,
        gap: 12,
        backgroundColor: "var(--vscode-editor-background)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>Mixer</h2>
      {tracks.length === 0 ? (
        <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
          No tracks yet. Add tracks in the Timeline to mix them here.
        </div>
      ) : (
        <>
          <Mixer />
          <AudioGraph />
        </>
      )}
    </div>
  );
}
