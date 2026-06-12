# Beehive Studio v0.5.0-alpha Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** First milestone of the 2026 AI-native evolutionary rebuild — vLLM inference layer, first MCP agent, Rust audio engine scaffold, and git-native projects.

**Architecture:** Keep Tauri v2 + React 19 frontend. Replace Ollama with vLLM. Extract first agent as MCP server. Add Rust CPAL audio engine alongside Tone.js.

**Tech Stack:** Tauri v2, React 19, TypeScript, Python 3.14, FastAPI, MCP, vLLM (containerized), Rust (CPAL + dasp + symphonia), uv, pnpm.

---

## Milestone 1: vLLM Inference Layer

### Task 1.1: Containerized vLLM Service

**Files:**
- Create: `services/inference/vllm/Containerfile`
- Create: `services/inference/vllm/docker-compose.yml`
- Create: `services/inference/vllm/start.sh`
- Modify: `services/agent-orchestrator/.env` (add vLLM endpoint)

**Context:** vLLM is not installed on the host. We run it via Podman/Docker container with GPU support if available, CPU fallback if not.

- [ ] **Step 1: Write vLLM Containerfile**

```dockerfile
FROM vllm/vllm-openai:latest

ENV MODEL_NAME="microsoft/Phi-4-mini-instruct"
ENV MAX_MODEL_LEN=4096
ENV GPU_MEMORY_UTILIZATION=0.85

EXPOSE 8000

CMD ["--model", "${MODEL_NAME}", "--max-model-len", "${MAX_MODEL_LEN}", "--gpu-memory-utilization", "${GPU_MEMORY_UTILIZATION}", "--port", "8000", "--host", "0.0.0.0"]
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
services:
  vllm:
    build:
      context: .
      dockerfile: Containerfile
    ports:
      - "8000:8000"
    volumes:
      - vllm-models:/root/.cache/huggingface
    environment:
      - MODEL_NAME=${MODEL_NAME:-microsoft/Phi-4-mini-instruct}
      - MAX_MODEL_LEN=4096
      - GPU_MEMORY_UTILIZATION=0.85
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  vllm-models:
```

- [ ] **Step 3: Write start script**

```bash
#!/bin/bash
set -euo pipefail

BACKEND=${BACKEND:-podman}
COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"

echo "Starting vLLM inference service..."
echo "Backend: $BACKEND"

$BACKEND compose -f "$COMPOSE_FILE" up -d

echo "vLLM starting on http://localhost:8000"
echo "Health: curl http://localhost:8000/health"
echo ""
echo "To stop: $BACKEND compose -f $COMPOSE_FILE down"
```

- [ ] **Step 4: Make start script executable**

Run: `chmod +x services/inference/vllm/start.sh`

- [ ] **Step 5: Add vLLM config to agent-orchestrator .env**

Add to `services/agent-orchestrator/.env`:
```
# Inference Layer
BEEHIVE_INFERENCE_PROVIDER=vllm
BEEHIVE_VLLM_URL=http://localhost:8000/v1
BEEHIVE_VLLM_MODEL=microsoft/Phi-4-mini-instruct
BEEHIVE_OLLAMA_URL=http://localhost:11434
BEEHIVE_FALLBACK_PROVIDER=ollama
```

- [ ] **Step 6: Commit**

```bash
git add services/inference/
git commit -m "feat(inference): containerized vLLM service with compose"
```

### Task 1.2: Unified Inference Client

**Files:**
- Create: `services/agent-orchestrator/api/inference.py`
- Modify: `services/agent-orchestrator/api/main.py` (add inference router)

**Context:** The backend currently calls Ollama directly. We add a unified client that tries vLLM first, falls back to Ollama.

- [ ] **Step 1: Write unified inference client**

```python
"""Unified inference client: vLLM primary, Ollama fallback."""
import os
from typing import AsyncIterator
import httpx

VLLM_URL = os.getenv("BEEHIVE_VLLM_URL", "http://localhost:8000/v1")
VLLM_MODEL = os.getenv("BEEHIVE_VLLM_MODEL", "microsoft/Phi-4-mini-instruct")
OLLAMA_URL = os.getenv("BEEHIVE_OLLAMA_URL", "http://localhost:11434")
FALLBACK = os.getenv("BEEHIVE_FALLBACK_PROVIDER", "ollama")


class InferenceClient:
    def __init__(self):
        self.vllm_http = httpx.AsyncClient(base_url=VLLM_URL, timeout=120.0)
        self.ollama_http = httpx.AsyncClient(base_url=OLLAMA_URL, timeout=120.0)

    async def chat(self, messages: list[dict], stream: bool = False) -> dict:
        """Chat completion with automatic fallback."""
        try:
            return await self._vllm_chat(messages, stream)
        except Exception as e:
            if FALLBACK == "ollama":
                return await self._ollama_chat(messages, stream)
            raise

    async def _vllm_chat(self, messages: list[dict], stream: bool) -> dict:
        payload = {
            "model": VLLM_MODEL,
            "messages": messages,
            "stream": stream,
            "temperature": 0.8,
            "max_tokens": 2048,
        }
        if stream:
            return self._vllm_stream(payload)
        r = await self.vllm_http.post("/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()

    async def _vllm_stream(self, payload: dict) -> AsyncIterator[str]:
        async with self.vllm_http.stream("POST", "/chat/completions", json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if line.startswith("data: "):
                    yield line[6:]

    async def _ollama_chat(self, messages: list[dict], stream: bool) -> dict:
        payload = {
            "model": os.getenv("BEEHIVE_MODEL", "llama3.2"),
            "messages": messages,
            "stream": stream,
        }
        r = await self.ollama_http.post("/api/chat", json=payload)
        r.raise_for_status()
        return r.json()

    async def health(self) -> dict:
        """Check all inference providers."""
        result = {"vllm": False, "ollama": False}
        try:
            r = await self.vllm_http.get("/models", timeout=5.0)
            result["vllm"] = r.status_code == 200
        except Exception:
            pass
        try:
            r = await self.ollama_http.get("/api/tags", timeout=5.0)
            result["ollama"] = r.status_code == 200
        except Exception:
            pass
        return result


inference_client = InferenceClient()
```

- [ ] **Step 2: Add inference router to main.py**

```python
from api.inference import inference_client

@app.get("/inference/health")
async def inference_health():
    return await inference_client.health()
```

- [ ] **Step 3: Test inference health endpoint**

Run: `cd services/agent-orchestrator && uv run uvicorn api.main:app --port 9876 &`
Run: `curl http://localhost:9876/inference/health`
Expected: JSON with vllm/ollama boolean flags

- [ ] **Step 4: Commit**

```bash
git add services/agent-orchestrator/api/inference.py
git commit -m "feat(inference): unified vLLM/ollama client with health checks"
```

---

## Milestone 2: First MCP Agent (Rhythm & Groove)

### Task 2.1: MCP Server Scaffold

**Files:**
- Create: `mcp-agents/rhythm-groove/pyproject.toml`
- Create: `mcp-agents/rhythm-groove/src/rhythm_groove/server.py`
- Create: `mcp-agents/rhythm-groove/src/rhythm_groove/__init__.py`

**Context:** MCP (Model Context Protocol) 1.27.1 is already installed. We create the first agent as an MCP server that exposes tools for rhythm generation.

- [ ] **Step 1: Write agent pyproject.toml**

```toml
[project]
name = "beehive-rhythm-groove-agent"
version = "0.5.0-alpha"
dependencies = [
    "mcp>=1.27.1",
    "pydantic>=2.0",
    "httpx",
]
requires-python = ">=3.11"

[project.scripts]
beehive-rhythm-agent = "rhythm_groove.server:main"
```

- [ ] **Step 2: Write MCP server**

```python
"""Rhythm & Groove Agent — MCP-native beat and bassline generation."""
import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("beehive-rhythm-groove")

TOOLS = [
    Tool(
        name="generate_bassline",
        description="Generate a rolling bassline MIDI pattern",
        inputSchema={
            "type": "object",
            "properties": {
                "bpm": {"type": "integer", "default": 130},
                "style": {"type": "string", "enum": ["techno", "house", "acid", "minimal"]},
                "root_note": {"type": "string", "default": "C"},
                "bars": {"type": "integer", "default": 4},
            },
            "required": ["style"],
        },
    ),
    Tool(
        name="generate_drum_pattern",
        description="Generate a drum pattern for specified genre",
        inputSchema={
            "type": "object",
            "properties": {
                "bpm": {"type": "integer", "default": 130},
                "style": {"type": "string", "enum": ["techno", "house", "breakbeat", "minimal"]},
                "variation": {"type": "string", "enum": ["straight", "swung", "ghost_notes"], "default": "straight"},
                "bars": {"type": "integer", "default": 4},
            },
            "required": ["style"],
        },
    ),
]


@app.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "generate_bassline":
        notes = _generate_bassline_notes(**arguments)
        return [TextContent(type="text", text=notes)]
    elif name == "generate_drum_pattern":
        pattern = _generate_drum_pattern(**arguments)
        return [TextContent(type="text", text=pattern)]
    raise ValueError(f"Unknown tool: {name}")


def _generate_bassline_notes(bpm: int, style: str, root_note: str, bars: int) -> str:
    """Generate bassline as JSON string."""
    import json
    # Simplified generation — will connect to inference layer in Task 2.2
    pattern = []
    for bar in range(bars):
        for step in range(16):
            if style == "techno" and step in [0, 4, 8, 12]:
                pattern.append({"note": f"{root_note}2", "velocity": 100, "start": bar * 4 + step / 4, "duration": 0.25})
            elif style == "acid" and step in [0, 3, 6, 10, 12]:
                pattern.append({"note": f"{root_note}2", "velocity": 110, "start": bar * 4 + step / 4, "duration": 0.125})
    return json.dumps({"bpm": bpm, "style": style, "notes": pattern})


def _generate_drum_pattern(bpm: int, style: str, variation: str, bars: int) -> str:
    """Generate drum pattern as JSON string."""
    import json
    kick = [1 if i % 4 == 0 else 0 for i in range(16 * bars)]
    snare = [1 if i % 8 == 4 else 0 for i in range(16 * bars)]
    hihat = [1 if i % 2 == 0 else 0 for i in range(16 * bars)]
    if variation == "swung":
        hihat = [1 if i % 2 == 0 and i % 4 != 2 else 0 for i in range(16 * bars)]
    return json.dumps({"bpm": bpm, "style": style, "kick": kick, "snare": snare, "hihat": hihat})


async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Initialize agent package**

Run: `cd mcp-agents/rhythm-groove && uv sync`

- [ ] **Step 4: Test MCP server**

Run: `cd mcp-agents/rhythm-groove && uv run python -c "from rhythm_groove.server import list_tools; import asyncio; print(asyncio.run(list_tools()))"`
Expected: List of 2 Tool objects

- [ ] **Step 5: Commit**

```bash
git add mcp-agents/
git commit -m "feat(mcp): Rhythm & Groove agent as MCP server"
```

### Task 2.2: MCP Client in Backend

**Files:**
- Create: `services/agent-orchestrator/api/mcp_client.py`
- Modify: `services/agent-orchestrator/api/main.py`

**Context:** The FastAPI backend needs to connect to MCP agents and expose their tools via HTTP.

- [ ] **Step 1: Write MCP client wrapper**

```python
"""MCP client for connecting to local agent fleet."""
import asyncio
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class AgentFleetClient:
    def __init__(self):
        self.sessions: dict[str, ClientSession] = {}
        self.exit_stack = AsyncExitStack()

    async def connect_agent(self, name: str, command: str, args: list[str] = None):
        """Connect to an MCP agent via stdio."""
        server_params = StdioServerParameters(
            command=command,
            args=args or [],
            env=None,
        )
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        read, write = stdio_transport
        session = await self.exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self.sessions[name] = session
        return session

    async def list_all_tools(self) -> list[dict]:
        """List tools from all connected agents."""
        tools = []
        for name, session in self.sessions.items():
            response = await session.list_tools()
            for tool in response.tools:
                tools.append({
                    "agent": name,
                    "name": tool.name,
                    "description": tool.description,
                })
        return tools

    async def call_tool(self, agent: str, tool: str, arguments: dict):
        """Call a tool on a specific agent."""
        session = self.sessions.get(agent)
        if not session:
            raise ValueError(f"Agent {agent} not connected")
        result = await session.call_tool(tool, arguments=arguments)
        return result

    async def disconnect_all(self):
        await self.exit_stack.aclose()


fleet_client = AgentFleetClient()
```

- [ ] **Step 2: Add fleet endpoints to main.py**

```python
from api.mcp_client import fleet_client

@app.on_event("startup")
async def startup():
    await fleet_client.connect_agent(
        "rhythm-groove",
        "uv",
        ["run", "--directory", "mcp-agents/rhythm-groove", "python", "-m", "rhythm_groove.server"],
    )

@app.on_event("shutdown")
async def shutdown():
    await fleet_client.disconnect_all()

@app.get("/agents/tools")
async def list_agent_tools():
    return await fleet_client.list_all_tools()

@app.post("/agents/{agent}/tools/{tool}")
async def call_agent_tool(agent: str, tool: str, arguments: dict):
    return await fleet_client.call_tool(agent, tool, arguments)
```

- [ ] **Step 3: Test fleet endpoints**

Run backend, then:
Run: `curl http://localhost:9876/agents/tools`
Expected: JSON list with generate_bassline and generate_drum_pattern

- [ ] **Step 4: Commit**

```bash
git add services/agent-orchestrator/api/mcp_client.py
git commit -m "feat(mcp): agent fleet client with HTTP bridge"
```

---

## Milestone 3: Rust Audio Engine Scaffold

### Task 3.1: CPAL Audio Engine Module

**Files:**
- Create: `crates/beehive-audio-engine/Cargo.toml`
- Create: `crates/beehive-audio-engine/src/lib.rs`
- Create: `crates/beehive-audio-engine/src/mixer.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml` (add workspace member)

**Context:** Build a minimal but functional Rust audio engine using CPAL. It runs alongside Tone.js initially, controlled by a feature flag.

- [ ] **Step 1: Write audio engine Cargo.toml**

```toml
[package]
name = "beehive-audio-engine"
version = "0.5.0-alpha"
edition = "2021"

[dependencies]
cpal = "0.15"
dasp = { version = "0.11", features = ["signal", "interpolate"] }
symphonia = { version = "0.5", features = ["all"] }
ringbuf = "0.4"
log = "0.4"

[dev-dependencies]
```

- [ ] **Step 2: Write mixer module**

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

pub struct Mixer {
    tracks: Arc<Mutex<Vec<Track>>>,
    sample_rate: f32,
    _stream: cpal::Stream,
}

struct Track {
    gain: f32,
    pan: f32,
    muted: bool,
    buffer: Vec<f32>,
    buffer_pos: usize,
}

impl Mixer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = host.default_output_device().ok_or("no output device")?;
        let config = device.default_output_config()?;
        let sample_rate = config.sample_rate().0 as f32;

        let tracks = Arc::new(Mutex::new(Vec::new()));
        let tracks_clone = tracks.clone();

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => Self::build_stream::<f32>(&device, &config.into(), tracks_clone)?,
            _ => return Err("unsupported sample format".into()),
        };

        stream.play()?;

        Ok(Mixer {
            tracks,
            sample_rate,
            _stream: stream,
        })
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        tracks: Arc<Mutex<Vec<Track>>>,
    ) -> Result<cpal::Stream, Box<dyn std::error::Error>>
    where
        T: cpal::SizedSample + cpal::FromSample<f32>,
    {
        let channels = config.channels as usize;
        let stream = device.build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let mut tracks = tracks.lock().unwrap();
                for frame in data.chunks_mut(channels) {
                    let mut mix_l = 0.0f32;
                    let mut mix_r = 0.0f32;
                    for track in tracks.iter_mut() {
                        if track.muted || track.buffer_pos >= track.buffer.len() {
                            continue;
                        }
                        let sample = track.buffer[track.buffer_pos] * track.gain;
                        let pan_l = (1.0 - track.pan).clamp(0.0, 1.0);
                        let pan_r = (1.0 + track.pan).clamp(0.0, 1.0);
                        mix_l += sample * pan_l;
                        mix_r += sample * pan_r;
                        track.buffer_pos += 1;
                    }
                    if channels >= 2 {
                        frame[0] = T::from_sample(mix_l.clamp(-1.0, 1.0));
                        frame[1] = T::from_sample(mix_r.clamp(-1.0, 1.0));
                    } else {
                        frame[0] = T::from_sample(((mix_l + mix_r) * 0.5).clamp(-1.0, 1.0));
                    }
                }
            },
            |err| eprintln!("audio stream error: {}", err),
            None,
        )?;
        Ok(stream)
    }

    pub fn add_track(&self) -> usize {
        let mut tracks = self.tracks.lock().unwrap();
        let id = tracks.len();
        tracks.push(Track {
            gain: 1.0,
            pan: 0.0,
            muted: false,
            buffer: Vec::new(),
            buffer_pos: 0,
        });
        id
    }

    pub fn set_track_gain(&self, id: usize, gain: f32) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(t) = tracks.get_mut(id) {
            t.gain = gain;
        }
    }

    pub fn set_track_pan(&self, id: usize, pan: f32) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(t) = tracks.get_mut(id) {
            t.pan = pan.clamp(-1.0, 1.0);
        }
    }

    pub fn load_clip(&self, track_id: usize, samples: Vec<f32>) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(t) = tracks.get_mut(track_id) {
            t.buffer = samples;
            t.buffer_pos = 0;
        }
    }
}
```

- [ ] **Step 3: Write lib.rs**

```rust
pub mod mixer;
```

- [ ] **Step 4: Add to workspace Cargo.toml**

Modify `apps/desktop/src-tauri/Cargo.toml` to add workspace member (or create workspace root):

If no workspace exists at project root, create:
`Cargo.toml` in project root:
```toml
[workspace]
members = [
    "apps/desktop/src-tauri",
    "crates/beehive-audio-engine",
    "crates/beehive-studio-vst",
]
resolver = "2"
```

- [ ] **Step 5: Build audio engine**

Run: `cd crates/beehive-audio-engine && cargo check`
Expected: Clean compile

- [ ] **Step 6: Commit**

```bash
git add crates/beehive-audio-engine/
git commit -m "feat(audio): CPAL-based Rust audio engine scaffold"
```

### Task 3.2: Tauri Command Bridge

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/audio_engine.rs`

**Context:** Expose the Rust audio engine to the frontend via Tauri commands.

- [ ] **Step 1: Write Tauri audio engine commands**

```rust
use beehive_audio_engine::mixer::Mixer;
use std::sync::Mutex;
use tauri::State;

pub struct AudioEngineState {
    mixer: Mutex<Option<Mixer>>,
}

#[tauri::command]
fn audio_engine_init(state: State<AudioEngineState>) -> Result<String, String> {
    let mixer = Mixer::new().map_err(|e| e.to_string())?;
    let mut guard = state.mixer.lock().map_err(|e| e.to_string())?;
    *guard = Some(mixer);
    Ok("initialized".to_string())
}

#[tauri::command]
fn audio_engine_add_track(state: State<AudioEngineState>) -> Result<usize, String> {
    let guard = state.mixer.lock().map_err(|e| e.to_string())?;
    let mixer = guard.as_ref().ok_or("mixer not initialized")?;
    Ok(mixer.add_track())
}

#[tauri::command]
fn audio_engine_set_gain(state: State<AudioEngineState>, track: usize, gain: f32) -> Result<(), String> {
    let guard = state.mixer.lock().map_err(|e| e.to_string())?;
    let mixer = guard.as_ref().ok_or("mixer not initialized")?;
    mixer.set_track_gain(track, gain);
    Ok(())
}
```

- [ ] **Step 2: Register commands in main.rs**

Add to main.rs:
```rust
mod audio_engine;
use audio_engine::AudioEngineState;

fn main() {
    tauri::Builder::default()
        .manage(AudioEngineState {
            mixer: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            audio_engine::audio_engine_init,
            audio_engine::audio_engine_add_track,
            audio_engine::audio_engine_set_gain,
            // ... existing commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Build Tauri app**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: Clean compile

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/audio_engine.rs
git commit -m "feat(tauri): audio engine command bridge"
```

---

## Milestone 4: Git-Native Projects

### Task 4.1: Git Project Backend

**Files:**
- Create: `packages/core-models/src/projectGit.ts`
- Modify: `apps/desktop/src/lib/db.ts`

**Context:** New projects are git repos. SQLite stays as fallback/legacy.

- [ ] **Step 1: Write git project manager**

```typescript
// packages/core-models/src/projectGit.ts
import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: string;
}

export class GitProjectManager {
  private baseDir: string;

  constructor(baseDir: string = '~/.local/share/beehive-studio/projects') {
    this.baseDir = baseDir.replace('~', process.env.HOME || '/home/kilisan');
  }

  async initProject(name: string): Promise<string> {
    const id = `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const projectDir = path.join(this.baseDir, id);
    await fs.mkdir(projectDir, { recursive: true });

    const git = simpleGit(projectDir);
    await git.init();

    const meta: ProjectMetadata = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '0.5.0',
    };

    await fs.writeFile(
      path.join(projectDir, 'project.json'),
      JSON.stringify(meta, null, 2)
    );

    await git.add('.');
    await git.commit('Initial project creation');

    return id;
  }

  async saveProject(id: string, data: object): Promise<void> {
    const projectDir = path.join(this.baseDir, id);
    await fs.writeFile(
      path.join(projectDir, 'session.json'),
      JSON.stringify(data, null, 2)
    );

    const git = simpleGit(projectDir);
    await git.add('.');
    await git.commit(`Auto-save at ${new Date().toISOString()}`);
  }

  async loadProject(id: string): Promise<object> {
    const projectDir = path.join(this.baseDir, id);
    const sessionPath = path.join(projectDir, 'session.json');
    const data = await fs.readFile(sessionPath, 'utf-8');
    return JSON.parse(data);
  }

  async listProjects(): Promise<ProjectMetadata[]> {
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const projects: ProjectMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const metaPath = path.join(this.baseDir, entry.name, 'project.json');
        const meta = await fs.readFile(metaPath, 'utf-8');
        projects.push(JSON.parse(meta));
      } catch {
        // skip invalid projects
      }
    }
    return projects;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core-models/src/projectGit.ts
git commit -m "feat(project): git-native project manager"
```

---

## Milestone 5: Production Deployment

### Task 5.1: Unified Compose File

**Files:**
- Create: `docker-compose.yml` (project root)
- Create: `scripts/deploy.sh`

**Context:** Single-command production deployment.

- [ ] **Step 1: Write root compose file**

```yaml
services:
  vllm:
    extends:
      file: services/inference/vllm/docker-compose.yml
      service: vllm

  agent-orchestrator:
    build:
      context: services/agent-orchestrator
      dockerfile: Containerfile
    ports:
      - "9876:9876"
    environment:
      - BEEHIVE_INFERENCE_PROVIDER=vllm
      - BEEHIVE_VLLM_URL=http://vllm:8000/v1
    depends_on:
      vllm:
        condition: service_healthy
    restart: unless-stopped

  beehive-studio:
    build:
      context: apps/desktop
      dockerfile: Containerfile
    ports:
      - "1420:1420"
    depends_on:
      - agent-orchestrator
    restart: unless-stopped
```

- [ ] **Step 2: Write deploy script**

```bash
#!/bin/bash
set -euo pipefail

echo "🐝 Beehive Studio Production Deployment"
echo "========================================"

BACKEND=${BACKEND:-podman}
echo "Using container backend: $BACKEND"

# Pull latest images
echo "📦 Pulling images..."
$BACKEND compose pull

# Start services
echo "🚀 Starting services..."
$BACKEND compose up -d

# Health checks
echo "🏥 Waiting for services..."
sleep 5

curl -sf http://localhost:9876/health && echo "✅ Agent Orchestrator: OK" || echo "❌ Agent Orchestrator: FAIL"
curl -sf http://localhost:8000/health && echo "✅ vLLM Inference: OK" || echo "❌ vLLM Inference: FAIL"

echo ""
echo "🎉 Beehive Studio is running!"
echo "   Agent API: http://localhost:9876"
echo "   vLLM API:  http://localhost:8000"
echo ""
echo "To stop: $BACKEND compose down"
```

- [ ] **Step 3: Make executable and test**

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml scripts/deploy.sh
git commit -m "feat(deploy): unified production compose and deploy script"
```

---

## Verification Checklist

Before claiming v0.5.0-alpha complete:

- [ ] `scripts/deploy.sh` starts all services successfully
- [ ] `curl http://localhost:9876/inference/health` returns both providers
- [ ] `curl http://localhost:9876/agents/tools` lists MCP agent tools
- [ ] `cargo check` passes in `crates/beehive-audio-engine`
- [ ] `cargo check` passes in `apps/desktop/src-tauri`
- [ ] `just test` passes (frontend + backend smoke tests)
- [ ] Git-native project can be created, saved, and loaded
- [ ] Legacy SQLite projects still open correctly

---

## Execution Options

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints.
