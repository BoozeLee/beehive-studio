import { useProjectStore } from "../stores/projectStore";
import { useTimelineStore } from "../stores/timelineStore";
import { SessionViewGrid } from "./desktop/SessionView/SessionViewGrid";

export function SessionPage() {
  const { clips, project } = useProjectStore();
  const { addClip } = useTimelineStore();

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 12 }}>
      <SessionViewGrid
        clips={clips}
        projectId={project?.id}
        onAccept={(clipId) => {
          const clip = clips.find((c) => c.id === clipId);
          if (clip) {
            addClip(clip);
          }
        }}
        onPlayClip={(clipId) => {
          console.log("play clip", clipId);
        }}
      />
    </div>
  );
}
