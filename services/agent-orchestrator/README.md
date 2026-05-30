# Beehive Studio Agent Orchestrator

## Quick Start

```bash
# From repo root
just backend    # Start the dev server on port 9876
```

## Containerized (Podman)

```bash
# Build the image
just podman-build

# Run the container
just podman-run

# Or manually:
podman build -t beehive-studio-agent:latest -f Containerfile .
podman run --rm -it -p 127.0.0.1:9876:9876 \
  -e OLLAMA_HOST=host.containers.internal:11434 \
  beehive-studio-agent:latest
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `Beehive Studio_AGENT_PORT` | `9876` | HTTP port for the orchestrator |
| `OLLAMA_HOST` | `127.0.0.1:11434` | Ollama API endpoint |
| `LANGSMITH_API_KEY` | — | LangSmith tracing key |
| `LANGSMITH_PROJECT` | `beehive-studio-sprint1` | LangSmith project name |
| `Beehive Studio_LUA_MAX_MEMORY` | `1048576` | Max Lua runtime memory (bytes) |

## Architecture

```
api/main.py           FastAPI entrypoint
agents/               LangGraph agents
  rhythm_groove.py    Rhythm & Groove specialist
tools/                Tool implementations
  midi_tools.py       MIDI generation utilities
lua/                  Lua scripting support
  __init__.py         Sandbox manager
  api.py              SafeMusicApi surface
```

## Development

```bash
# Install deps
uv sync

# Run tests
uv run pytest

# Format & lint
uv run ruff format .
uv run ruff check .
```
