import { useTransportStore } from "../stores/transportStore";
import { Timeline } from "./desktop/Timeline/Timeline";

export function TimelinePage() {
  const { playing, currentBeat, bpm } = useTransportStore();

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Timeline isPlaying={playing} currentBeat={currentBeat} bpm={bpm} />
    </div>
  );
}
