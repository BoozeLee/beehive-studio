import { useCallback } from "react";
import * as api from "../lib/api";
import { useProjectStore } from "../stores/projectStore";
import { useAppStore } from "../stores/appStore";
import { useTransportStore } from "../stores/transportStore";
import { SessionViewGrid } from "./desktop/SessionView/SessionViewGrid";
import { playClipImmediate } from "../lib/audioScheduler";
import { extractFeatures } from "./desktop/TasteGraph/tasteFeatures";
import { createChannel } from "../lib/audioMixer";
import type { Clip } from "../lib/desktopTypes";

const TRACK_COLORS = ["#ef4444", "#3b82f6", "#a855f7", "#10b981", "#f59e0b"];

export function SessionPage() {
  const { clips, project, tracks, addClip, addTrack, updateTrack } = useProjectStore();
  const { addNotification } = useAppStore();
  const { bpm } = useTransportStore();

  const handlePlayClip = useCallback(
    (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      const track = tracks.find((t) => t.id === clip?.trackId);
      if (clip && track) {
        playClipImmediate(clip, track, bpm);
      } else {
        addNotification("Could not play clip: missing track", "error");
      }
    },
    [clips, tracks, bpm, addNotification]
  );

  const createArrangementClip = useCallback(
    (clip: Clip, suffix = "accepted") => {
      const maxStart = clips
        .filter((c) => c.trackId === clip.trackId)
        .reduce((max, c) => Math.max(max, c.start + c.duration), 0);
      const accepted: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        name: `${clip.name} (${suffix})`,
        start: maxStart,
        loop: false,
        metadata: clip.metadata ? { ...clip.metadata, generative: true } : { generative: true },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      addClip(accepted);
      const track = tracks.find((t) => t.id === accepted.trackId);
      if (track) {
        updateTrack({ ...track, clips: [...track.clips, accepted.id] });
      }
      return accepted;
    },
    [clips, tracks, addClip, updateTrack]
  );

  const sendTasteFeedback = useCallback(
    async (clip: Clip, verdict: "like" | "never_again") => {
      if (!project?.id) return;
      try {
        await api.sendTasteFeedback({
          projectId: project.id,
          clipId: clip.id,
          verdict,
          label: clip.name,
          featureVector: clip.midiData ? extractFeatures(clip.midiData.notes) : undefined,
          tags: clip.metadata?.tags ?? [clip.metadata?.agentId ?? "pattern"],
          metadata: {
            agentId: clip.metadata?.agentId,
            confidence: clip.metadata?.confidence,
          },
        });
      } catch (err) {
        addNotification(`Taste feedback failed: ${String(err)}`, "error");
      }
    },
    [project?.id, addNotification]
  );

  const handleAccept = useCallback(
    (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      void sendTasteFeedback(clip, "like");
      const accepted = createArrangementClip(clip, "accepted");
      addNotification(`Accepted clip: ${accepted.name}`, "success");
    },
    [clips, createArrangementClip, sendTasteFeedback, addNotification]
  );

  const handleReject = useCallback(
    (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      void sendTasteFeedback(clip, "never_again");
      addNotification(`Rejected clip: ${clip.name}`, "info");
    },
    [clips, sendTasteFeedback, addNotification]
  );

  const handleVariations = useCallback(
    async (clipId: string) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip || !project) return;
      const agentId = clip.metadata?.agentId;
      const brief = clip.metadata?.promptText?.trim();
      if (!agentId || !brief) {
        addNotification("Cannot create variation: missing agent or prompt", "error");
        return;
      }
      addNotification(`Generating variation for ${clip.name}...`, "info");
      try {
        const session = await api.runAgent({
          agent: agentId,
          brief,
          projectId: project.id,
          context: {
            variation_of: clip.id,
            previous_session_id: clip.metadata?.sessionId,
            bpm: project.bpm,
          },
        });
        const data = session.artifacts?.[0]?.data as
          | { notes?: Array<{ pitch: number; velocity: number; start: number; duration: number }> }
          | undefined;
        if (!data?.notes) {
          addNotification("Agent returned no MIDI notes for variation", "info");
          return;
        }

        let track = tracks.find((t) => t.id === clip.trackId);
        if (!track) {
          const id = crypto.randomUUID();
          track = {
            id,
            name: `Generated ${agentId}`,
            type: agentId === "drums" ? "drum" : "synth",
            color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false,
            arm: false,
            clips: [],
            automationLanes: [],
          };
          addTrack(track);
          createChannel(track.id, track.name);
        }

        const duration = Math.max(
          ...data.notes.map((n) => n.start + n.duration),
          4
        );
        const variation: Clip = {
          id: crypto.randomUUID(),
          name: `${clip.name} (variation)`,
          type: "midi",
          trackId: track.id,
          start: 0,
          duration,
          loop: false,
          color: track.color,
          midiData: { notes: data.notes },
          metadata: {
            generative: true,
            agentId,
            promptText: brief,
            sessionId: session.id,
            reasoningTrace: session.reasoning?.slice(-3).join("\n"),
            tags: [agentId, "variation"],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        addClip(variation);
        updateTrack({ ...track, clips: [...track.clips, variation.id] });
        addNotification(`Variation added: ${variation.name}`, "success");
      } catch (err) {
        addNotification(`Variation failed: ${String(err)}`, "error");
      }
    },
    [clips, project, tracks, addClip, addTrack, updateTrack, addNotification]
  );

  const handleLaunchScene = useCallback(() => {
    addNotification("Launch scene queued all visible clips", "info");
  }, [addNotification]);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 12 }}>
      <SessionViewGrid
        clips={clips}
        projectId={project?.id}
        onPlayClip={handlePlayClip}
        onAccept={handleAccept}
        onReject={handleReject}
        onVariations={handleVariations}
        onLaunchScene={handleLaunchScene}
      />
    </div>
  );
}
