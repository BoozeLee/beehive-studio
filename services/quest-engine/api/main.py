"""MixHive Quest Engine — FastAPI for Collab Quests + XP + Reputation"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any
import uuid

app = FastAPI(title="Quest Engine", version="0.1.0")

class Quest(BaseModel):
    id: str
    title: str
    description: str
    reward_xp: int
    reward_tokens: int = 0
    assignee_id: str | None = None
    status: str = "open"  # open, accepted, completed, rejected

class CompleteQuestRequest(BaseModel):
    quest_id: str
    user_id: str
    evidence_url: str | None = None

_QUESTS: dict[str, Quest] = {}
_XP_TOTAL: dict[str, int] = {}

@app.post("/quests")
async def create_quest(quest: Quest) -> dict[str, Any]:
    """Create a new collab quest."""
    quest.id = str(uuid.uuid4()) if not quest.id else quest.id
    _QUESTS[quest.id] = quest
    return {"status": "ok", "quest_id": quest.id}

@app.get("/quests")
async def list_quests(status: str | None = None) -> list[Quest]:
    """List all quests, optionally filter by status."""
    quests = list(_QUESTS.values())
    if status:
        quests = [q for q in quests if q.status == status]
    return quests

@app.post("/quests/complete")
async def complete_quest(req: CompleteQuestRequest) -> dict[str, Any]:
    """Mark quest completed and award XP/reputation."""
    if req.quest_id not in _QUESTS:
        raise HTTPException(status_code=404, detail="Quest not found")
    
    quest = _QUESTS[req.quest_id]
    quest.status = "completed"
    
    # Award XP
    _XP_TOTAL[req.user_id] = _XP_TOTAL.get(req.user_id, 0) + quest.reward_xp
    
    return {
        "status": "ok",
        "xp_awarded": quest.reward_xp,
        "new_total_xp": _XP_TOTAL[req.user_id],
    }

@app.get("/users/{user_id}/xp")
async def get_user_xp(user_id: str) -> dict[str, Any]:
    """Get user XP total."""
    return {
        "user_id": user_id,
        "total_xp": _XP_TOTAL.get(user_id, 0),
    }


@app.get("/quests/leaderboard")
async def get_leaderboard(limit: int = 10) -> list[dict[str, Any]]:
    """Get top users by XP for scene ranking."""
    sorted_users = sorted(_XP_TOTAL.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        {"user_id": uid, "total_xp": xp, "rank": i + 1}
        for i, (uid, xp) in enumerate(sorted_users)
    ]
