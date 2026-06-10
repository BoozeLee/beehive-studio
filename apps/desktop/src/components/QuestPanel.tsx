import { useQuestList, useCompleteQuest, useUserXP } from "../hooks/useQuests";

interface Props {
  currentUserId: string;
}

export function QuestPanel({ currentUserId }: Props) {
  const { quests, loading } = useQuestList("open");
  const { completeQuest } = useCompleteQuest();
  const { xp } = useUserXP(currentUserId);

  if (loading) return <div className="panel-loading">Loading quests...</div>;

  return (
    <div className="quest-panel">
      <header className="quest-header">
        <h3>Collab Quests</h3>
        <span className="xp-badge">XP: {xp ?? 0}</span>
      </header>
      {quests.length === 0 && (
        <div className="quest-empty">No open quests available.</div>
      )}
      <ul className="quest-list">
        {quests.map((q) => (
          <li key={q.id} className="quest-item">
            <h4>{q.title}</h4>
            <p>{q.description}</p>
            <footer>
              <span>Reward: {q.reward_xp} XP</span>
              <button onClick={() => completeQuest(q.id, currentUserId)}>
                Complete
              </button>
            </footer>
          </li>
        ))}
      </ul>
    </div>
  );
}
