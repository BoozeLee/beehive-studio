import { useState } from "react";
import type { TasteFeedbackPayload } from "../../../../../packages/core-models/index";
import { sendTasteFeedback } from "../../lib/tasteGraphApi";

interface Props {
  payload: TasteFeedbackPayload;
  onFeedback?: (verdict: "like" | "never_again") => void;
}

export function LikeButton({ payload, onFeedback }: Props) {
  const [busy, setBusy] = useState(false);

  async function handle(verdict: "like" | "never_again") {
    if (busy) return;
    setBusy(true);
    try {
      await sendTasteFeedback({ ...payload, verdict });
      onFeedback?.(verdict);
    } catch (e) {
      console.error("Taste feedback failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 4, opacity: busy ? 0.5 : 1 }}>
      <button
        type="button"
        title="Like — teach my taste"
        onClick={() => handle("like")}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#4ade80" }}
      >
        ♥
      </button>
      <button
        type="button"
        title="Never again — avoid this style"
        onClick={() => handle("never_again")}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444" }}
      >
        ✕
      </button>
    </span>
  );
}
