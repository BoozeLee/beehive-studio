import type { TasteFeedbackPayload, TasteQueryResult } from "../../../../packages/core-models/index";

const ORCHESTRATOR_URL = "http://127.0.0.1:9876";

export async function queryTaste(
  projectId: string,
  intent: string,
  featureVector?: number[],
  topK = 3
): Promise<TasteQueryResult> {
  const resp = await fetch(`${ORCHESTRATOR_URL}/taste/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      intent,
      top_k: topK,
      feature_vector: featureVector,
    }),
  });
  if (!resp.ok) throw new Error(`Taste query failed: ${resp.status}`);
  const data = await resp.json();
  return { nodes: data.nodes || [], summary: data.summary || "" };
}

export async function sendTasteFeedback(payload: TasteFeedbackPayload): Promise<void> {
  const resp = await fetch(`${ORCHESTRATOR_URL}/taste/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: payload.projectId,
      clip_id: payload.clipId,
      verdict: payload.verdict,
      label: payload.label,
      feature_vector: payload.featureVector,
      tags: payload.tags,
      metadata: payload.metadata,
    }),
  });
  if (!resp.ok) throw new Error(`Taste feedback failed: ${resp.status}`);
}
