import { useCallback, useState } from "react";
import type {
  BuildEvent,
  BuildJob,
  JetBeeBuildRequest,
} from "../../../../packages/core-models/index";

const API_BASE = import.meta.env.VITE_JETBEE_API_URL ?? "http://127.0.0.1:9000";

export function useJetBeeBuild() {
  const [job, setJob] = useState<BuildJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (payload: JetBeeBuildRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(payload.projectId)}/builds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const next = (await response.json()) as BuildJob;
      setJob(next);
      return next;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (projectId: string, buildId: string, revision: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(projectId)}/builds/${buildId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectRevision: revision, cloudApproved: false }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const next = (await response.json()) as BuildJob;
      setJob(next);
      return next;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reject = useCallback(async (projectId: string, buildId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(projectId)}/builds/${buildId}/reject`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await response.text());
      const next = (await response.json()) as BuildJob;
      setJob(next);
      return next;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const consumeEvent = useCallback((event: BuildEvent) => {
    setJob((current) => {
      if (!current || current.id !== event.buildId) return current;
      if (event.type === "build.progress") {
        return { ...current, status: "running", progress: Number(event.metadata.progress ?? 0) };
      }
      if (event.type === "build.artifact_ready") {
        const artifact = event.metadata.artifact;
        return artifact && typeof artifact === "object"
          ? { ...current, artifacts: [...current.artifacts, artifact as BuildJob["artifacts"][number]] }
          : current;
      }
      if (event.type === "build.completed") return { ...current, status: "completed", progress: 1 };
      if (event.type === "build.failed") return { ...current, status: "failed", error: String(event.metadata.error ?? "Build failed") };
      if (event.type === "build.cancelled") return { ...current, status: "cancelled" };
      return current;
    });
  }, []);

  return { job, error, loading, request, approve, reject, consumeEvent };
}
