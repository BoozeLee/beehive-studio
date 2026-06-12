import { useState, useCallback } from "react";

export interface HiveAttribution {
  service?: string;
  model?: string;
  profile?: string;
  prompt_versions?: Record<string, string>;
  latency_ms?: number;
}

export interface HiveCreativePlan {
  summary?: string;
  rationale?: string[];
  confidence?: Record<string, number>;
  alternatives?: Array<{ direction?: string; why?: string; delta_summary?: string }>;
  warnings?: string[];
  evidence?: string[];
}

export interface HiveProposal {
  status?: string;
  degraded?: boolean;
  attribution?: HiveAttribution;
  creative_plan?: HiveCreativePlan;
}

interface UseHiveAdvisorReturn {
  proposal: HiveProposal | null;
  isLoading: boolean;
  error: string | null;
  requestAdvice: (brief: string, sessionContext?: Record<string, unknown>) => Promise<HiveProposal | null>;
  clearProposal: () => void;
}

const API_BASE = import.meta.env.VITE_JETBEE_API_URL || "http://127.0.0.1:9000";

export function useHiveAdvisor(): UseHiveAdvisorReturn {
  const [proposal, setProposal] = useState<HiveProposal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestAdvice = useCallback(async (
    brief: string,
    sessionContext?: Record<string, unknown>
  ): Promise<HiveProposal | null> => {
    if (!brief.trim()) return null;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/hive999/advise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          session_context: sessionContext || {},
          style_references: [],
        }),
      });
      if (!res.ok) {
        throw new Error(`Hive 999 HTTP ${res.status}`);
      }
      const data: HiveProposal = await res.json();
      setProposal(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearProposal = useCallback(() => {
    setProposal(null);
    setError(null);
  }, []);

  return { proposal, isLoading, error, requestAdvice, clearProposal };
}
