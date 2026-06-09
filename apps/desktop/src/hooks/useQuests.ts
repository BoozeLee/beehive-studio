import { useState, useEffect, useCallback } from "react";

const QUEST_ENGINE_URL = "http://localhost:8000";

export interface Quest {
  id: string;
  title: string;
  description: string;
  reward_xp: number;
  reward_tokens?: number;
  assignee_id?: string;
  status: "open" | "accepted" | "completed" | "rejected";
}

export function useQuestList(status?: string) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(`${QUEST_ENGINE_URL}/quests`);
      if (status) url.searchParams.set("status", status);
      const res = await fetch(url.toString());
      const data = await res.json();
      setQuests(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  return { quests, loading, error, refetch: fetchQuests };
}

export function useCompleteQuest() {
  const completeQuest = useCallback(async (questId: string, userId: string) => {
    const res = await fetch(`${QUEST_ENGINE_URL}/quests/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quest_id: questId, user_id: userId }),
    });
    return res.json();
  }, []);

  return { completeQuest };
}

export function useUserXP(userId: string) {
  const [xp, setXp] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`${QUEST_ENGINE_URL}/users/${userId}/xp`)
      .then((r) => r.json())
      .then((d) => setXp(d.total_xp))
      .finally(() => setLoading(false));
  }, [userId]);

  return { xp, loading };
}
