# Agent Tool API — Contributor Guide

## Architecture Overview

Agents are Python async functions registered in `services/agent-orchestrator/orchestrator.py` via `AgentRegistry`. 
Each agent has a Tauri bridge endpoint in `apps/desktop/src-tauri/src/main.rs` and a FastAPI endpoint in 
`services/agent-orchestrator/api/main.py`.

```
Frontend (React) → Tauri invoke() → Rust command → HTTP → FastAPI → LangGraph Agent
```

---

## Adding a New Agent

### 1. Create the agent file

Create `services/agent-orchestrator/agents/<name>.py`:

```python
async def run_<name>_agent(brief: str, session_context: dict) -> dict:
    reasoning: list[str] = []
    # Agent logic here
    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        # Agent-specific result fields
    }
```

### 2. Register in the registry

Edit `services/agent-orchestrator/orchestrator.py` — add a `cls.register(AgentInfo(...))` call in `initialize()`.

### 3. Add FastAPI endpoint

Edit `services/agent-orchestrator/api/main.py` — add:

```python
@app.post("/agents/<name>")
async def agent_<name>(req: SomeRequest):
    from agents.<name> import run_<name>_agent
    result = await run_<name>_agent(
        brief=req.brief,
        session_context=req.session_context,
    )
    return result
```

### 4. Add Rust Tauri command (if needed)

Edit `apps/desktop/src-tauri/src/main.rs`:

```rust
#[tauri::command]
async fn run_<name>_agent(brief: String, session_context: serde_json::Value) -> Result<serde_json::Value, String> {
    // HTTP POST to http://127.0.0.1:9876/agents/<name>
}
```

Register in `invoke_handler!` macro.

### 5. Add frontend component (optional)

Create `apps/desktop/src/components/<Name>Panel.tsx` and add toggle in `App.tsx`.

### 6. Add tests

Create `services/agent-orchestrator/tests/test_<name>.py` with pytest tests.

---

## Agent Caching

Agent results are cached in memory via `api/agent_cache.py`:

- **TTL**: 5 minutes
- **Max size**: 256 entries
- **Cache key**: SHA256 hash of brief + relevant session context (bpm, genre, key)
- **Endpoints**: `GET /cache/stats`, `POST /cache/invalidate`
- **Hit rates visible in**: App logs

To bypass cache during development, add `Cache-Control: no-cache` header or call `POST /cache/invalidate`.

---

## Agent Registry

Defined in `orchestrator.py`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `str` | Unique identifier |
| `capability` | `AgentCapability` | Enum value |
| `description` | `str` | Human-readable description |
| `chain_order` | `int` | Order in orchestration chain (-1 = analysis only) |
| `llm_enabled` | `bool` | Whether LLM inference is available |

Available capabilities: `RHYTHM`, `DRUMS`, `HARMONY`, `MELODY`, `ARRANGEMENT`, `STYLE`, `TEXTURE`, `MIXING`, `SOUND_DESIGN`, `MASTERING`, `SAMPLE_CURATOR`.

---

## Performance Notes

- Agent generation time is dominated by Ollama LLM inference (~3-8s per call)
- Caching avoids repeated inference for identical briefs
- Cold start imports all modules in ~0.3s; uvicorn boot adds ~2-3s
- Audio rendering uses OfflineAudioContext (browser) or standard Web Audio API
