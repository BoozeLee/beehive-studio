# Operation JetBee — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the JetBee end-to-end build round-trip with a deterministic local compiler provider, wire MixHive publish/explore dialogs, remove legacy `App.tsx`, and ship a minimal Taste Graph that makes agents learn from user feedback.

**Architecture:** Add a `BeehiveLocalProvider` to the gateway that renders WAV/MIDI sketches deterministically from the build prompt; wire the existing MixHive dialogs into `JetBeeApp.tsx`; delete `App.tsx`; add a `taste_graph` module in the agent orchestrator with JSON persistence, simple feature vectors, and agent query integration; surface Like/Never-Again buttons and a TastePanel in the desktop UI.

**Tech Stack:** Python 3.13 (gateway + orchestrator), FastAPI, Pydantic, `mido`, `pydub`; TypeScript/React (desktop), Tone.js, Zustand; `just` for task running; `pytest` + `vitest` for tests.

---

## File structure map

| File | Responsibility |
|------|----------------|
| `apps/api/services/compiler_providers.py` | Add `BeehiveLocalProvider`; reorder `default_providers()`. |
| `apps/api/tests/test_compiler_providers.py` | (Create if missing) Test local provider health/submit/fetch. |
| `apps/api/services/build_coordinator.py` | Already updated with 245s timeout; no further changes. |
| `apps/desktop/src/JetBeeApp.tsx` | Import `PublishDialog`, `ExploreDialog`; add state + menu buttons; remove duplicate export. |
| `apps/desktop/src/App.tsx` | Delete after confirming no imports remain. |
| `services/agent-orchestrator/taste_graph/graph.py` | `TasteGraph` class: add/query nodes and edges, feedback. |
| `services/agent-orchestrator/taste_graph/embeddings.py` | Extract simple feature vectors from MIDI clips. |
| `services/agent-orchestrator/taste_graph/store.py` | Load/save per-project and per-user graphs. |
| `services/agent-orchestrator/taste_graph/__init__.py` | Public exports. |
| `services/agent-orchestrator/agents/drums.py` | Query TasteGraph before generation; append references to reasoning. |
| `services/agent-orchestrator/agents/melody.py` | Query TasteGraph before generation; append references to reasoning. |
| `services/agent-orchestrator/agents/rhythm_groove.py` | Query TasteGraph before generation; append references to reasoning. |
| `services/agent-orchestrator/tests/test_taste_graph.py` | Unit tests for graph query/feedback. |
| `apps/desktop/src/components/TasteGraph/LikeButton.tsx` | Clip-level Like/Never-Again buttons. |
| `apps/desktop/src/components/TasteGraph/TastePanel.tsx` | Read-only taste references panel. |
| `apps/desktop/src/components/TasteGraph/index.ts` | Barrel export. |
| `apps/desktop/src/lib/tasteGraphApi.ts` | Orchestrator API client for taste graph actions. |
| `packages/core-models/index.ts` | Add `TasteNode`, `TasteEdge`, `TasteQueryResult` types. |

---

## Task 1: Add deterministic local compiler provider

**Files:**
- Modify: `apps/api/services/compiler_providers.py`
- Create: `apps/api/tests/test_compiler_providers.py`

### Step 1.1: Write the failing test

Create `apps/api/tests/test_compiler_providers.py`:

```python
import pytest
from services.compiler_providers import BeehiveLocalProvider, default_providers


@pytest.mark.anyio
async def test_beehive_local_health():
    provider = BeehiveLocalProvider()
    health = await provider.health()
    assert health.provider == "beehive-local"
    assert health.ready is True
    assert health.local is True


@pytest.mark.anyio
async def test_beehive_local_submit_and_fetch(tmp_path):
    provider = BeehiveLocalProvider()
    from services.compiler_providers import CompileRequest

    dest = tmp_path / "build.wav"
    request = CompileRequest(
        build_id="build-1",
        project_id="proj-1",
        prompt="rolling techno bass at 140 bpm",
        destination=dest,
        duration=5,
    )
    job = await provider.submit(request)
    assert job.status == "queued"

    # Poll once; local provider completes synchronously on first poll.
    job = await provider.poll(job.id)
    assert job.status == "completed"
    assert job.progress == 1.0

    artifact = await provider.fetch_artifact(job, request)
    assert artifact.kind == "audio"
    assert artifact.provider == "beehive-local"
    assert dest.exists()
    assert dest.stat().st_size > 0


def test_default_providers_includes_local():
    providers = default_providers()
    assert "beehive-local" in providers
    assert "ace-rest" in providers
```

### Step 1.2: Run test to verify it fails

```bash
cd /home/kilisan/beehive-studio/apps/api
python -m pytest tests/test_compiler_providers.py -v
```

Expected: `FAILED tests/test_compiler_providers.py::test_beehive_local_health - AttributeError: module 'services.compiler_providers' has no attribute 'BeehiveLocalProvider'`

### Step 1.3: Implement `BeehiveLocalProvider`

Add to `apps/api/services/compiler_providers.py` after imports:

```python
import wave
import struct
import math
import mido

from services.build_contracts import BuildArtifact, ProviderHealth
```

Add class after `DeapiMcpProvider`:

```python
class BeehiveLocalProvider:
    """Deterministic local compiler that emits a WAV + MIDI sketch without external services."""

    name = "beehive-local"
    local = True

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}

    async def health(self) -> ProviderHealth:
        return ProviderHealth(
            provider=self.name,
            ready=True,
            local=True,
            detail="deterministic local sketch provider",
        )

    async def submit(self, request: CompileRequest) -> ProviderJob:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {
            "request": request,
            "status": "queued",
            "progress": 0.0,
        }
        return ProviderJob(id=job_id, status="queued")

    async def poll(self, job_id: str) -> ProviderJob:
        job = self._jobs.get(job_id)
        if job is None:
            return ProviderJob(id=job_id, status="failed", error="unknown job")
        if job["status"] == "queued":
            # Synchronous, fast render on first poll.
            try:
                self._render(job["request"])
                job["status"] = "completed"
                job["progress"] = 1.0
            except Exception as exc:
                job["status"] = "failed"
                job["progress"] = 1.0
                job["error"] = str(exc)
        return ProviderJob(
            id=job_id,
            status=job["status"],
            progress=job["progress"],
            error=job.get("error"),
        )

    async def cancel(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact:
        request.destination.parent.mkdir(parents=True, exist_ok=True)
        if not request.destination.exists():
            self._render(request)
        return BuildArtifact(
            id=f"artifact-{job.id}",
            kind="audio",
            path=str(request.destination),
            provider=self.name,
            metadata={"providerJobId": job.id, "source": "deterministic-local"},
        )

    def _render(self, request: CompileRequest) -> None:
        """Render a short WAV file and sidecar MIDI using deterministic rules."""
        duration = max(1, min(request.duration, 30))
        sample_rate = 44100
        num_frames = int(duration * sample_rate)
        request.destination.parent.mkdir(parents=True, exist_ok=True)

        # Simple wavetable: mix of sine + low noise, amplitude-modulated by a 4/4 kick envelope.
        with wave.open(str(request.destination), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            for frame in range(num_frames):
                t = frame / sample_rate
                beat_phase = (t * (140 / 60)) % 4  # 140 BPM 4/4
                kick_env = math.exp(-8 * (beat_phase % 1)) if beat_phase % 1 < 0.5 else 0.0
                sine = math.sin(2 * math.pi * 110 * t)
                sample = int(32767 * 0.5 * (sine * kick_env))
                wav.writeframes(struct.pack("<h", max(-32768, min(32767, sample))))

        # Sidecar MIDI with a simple bass pattern.
        mid = mido.MidiFile(ticks_per_beat=480)
        track = mido.MidiTrack()
        mid.tracks.append(track)
        track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(140)))

        ticks_per_16th = 480 // 4
        for bar in range((duration // 4) + 1):
            for step in range(16):
                if step % 4 == 0:
                    tick = bar * 4 * 480 + step * ticks_per_16th
                    track.append(mido.Message("note_on", note=36, velocity=100, time=tick))
                    track.append(mido.Message("note_off", note=36, velocity=0, time=ticks_per_16th))
        mid.save(str(request.destination.with_suffix(".mid")))
```

### Step 1.4: Make `beehive-local` the first default provider

Change `default_providers()` to:

```python
default_providers() -> dict[str, CompilerProvider]:
    providers: list[CompilerProvider] = [
        BeehiveLocalProvider(),
        AceRestProvider(),
        AceCppProvider(),
        DeapiRestProvider(),
        DeapiMcpProvider(),
    ]
    return {provider.name: provider for provider in providers}
```

### Step 1.5: Run tests

```bash
cd /home/kilisan/beehive-studio/apps/api
python -m pytest tests/test_compiler_providers.py -v
```

Expected: all tests pass.

### Step 1.6: Verify gateway health

```bash
curl -s http://127.0.0.1:9000/health | python -m json.tool
```

Expected: `beehive-local` shows `ready: true`.

### Step 1.7: Commit

```bash
cd /home/kilisan/beehive-studio
git add apps/api/services/compiler_providers.py apps/api/tests/test_compiler_providers.py
git commit -m "feat(gateway): deterministic local compiler provider beehive-local

- Renders deterministic WAV + MIDI sketch without ACE-Step
- Becomes first default provider so dev round-trip works
- Adds unit tests"
```

---

## Task 2: Wire MixHive PublishDialog into JetBeeApp

**Files:**
- Modify: `apps/desktop/src/JetBeeApp.tsx`

### Step 2.1: Add import

Add near existing component imports:

```typescript
import { PublishDialog } from "./components/PublishDialog/PublishDialog";
```

### Step 2.2: Add state

After `const [showExportDialog, setShowExportDialog] = useState(false);`:

```typescript
const [showPublishDialog, setShowPublishDialog] = useState(false);
const [publishAudioBlob, setPublishAudioBlob] = useState<Blob | null>(null);
const [publishDuration, setPublishDuration] = useState<number | undefined>(undefined);
```

### Step 2.3: Add a helper to prepare publish audio

After `handleExportAudio` function, add:

```typescript
const handlePublishFromExport = useCallback(async () => {
  if (exportPayload.renderClips.length === 0) {
    setStatus("Nothing audible to publish — arrange some clips first");
    return;
  }
  setStatus("Preparing audio for MixHive...");
  try {
    const resolvedClips = await Promise.all(
      exportPayload.renderClips.map(async (clip) => ({
        ...clip,
        audioFilePath: clip.audioFilePath
          ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
          : undefined,
      }))
    );
    const wavData = await exportProjectAudio(resolvedClips, exportPayload.mixerTracks, transport.bpm, renderPreset);
    const blob = new Blob([wavData], { type: "audio/wav" });
    setPublishAudioBlob(blob);
    setPublishDuration(exportSummary.durationSecs);
    setShowPublishDialog(true);
    setStatus("Publish dialog open");
  } catch (err) {
    setStatus(`Publish prep failed: ${String(err)}`);
  }
}, [exportPayload, exportSummary, projectName, renderPreset, transport.bpm]);
```

(Note: if `exportProjectAudio` returns `Uint8Array`, wrap in `Blob`. If it already returns `Blob`, use directly. Inspect `apps/desktop/src/lib/audioEngine.ts` to confirm.)

### Step 2.4: Add a toolbar/menu button

Find the JSX block with export buttons (search for `ExportAudioDialog` or `handleExportAudio`). Add a new button next to export:

```tsx
<button
  onClick={() => void handlePublishFromExport()}
  disabled={isExportingAudio || exportPayload.renderClips.length === 0}
  style={buttonStyle(COLORS.accent, isExportingAudio || exportPayload.renderClips.length === 0)}
>
  🌐 Publish to MixHive
</button>
```

Use existing local `buttonStyle` helper or inline style matching nearby buttons.

### Step 2.5: Render the dialog

At the end of the returned JSX, after `ExportAudioDialog`, add:

```tsx
<PublishDialog
  isOpen={showPublishDialog}
  onClose={() => setShowPublishDialog(false)}
  defaultTitle={projectName}
  defaultBpm={Math.round(transport.bpm)}
  defaultGenre="techno"
  audioBlob={publishAudioBlob}
  durationSecs={publishDuration}
/>
```

### Step 2.6: Type-check

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx tsc --noEmit
```

Expected: no new errors.

### Step 2.7: Commit

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(desktop): wire PublishDialog into JetBeeApp

- Adds 'Publish to MixHive' button that renders arrangement to WAV
- Opens PublishDialog with project metadata and audio blob"
```

---

## Task 3: Wire MixHive ExploreDialog into JetBeeApp

**Files:**
- Modify: `apps/desktop/src/JetBeeApp.tsx`

### Step 3.1: Add import

```typescript
import { ExploreDialog } from "./components/ExploreDialog/ExploreDialog";
```

### Step 3.2: Add state

```typescript
const [showExploreDialog, setShowExploreDialog] = useState(false);
```

### Step 3.3: Add menu button

Add next to the publish button:

```tsx
<button
  onClick={() => setShowExploreDialog(true)}
  style={buttonStyle(COLORS.accent, false)}
>
  🔍 Explore MixHive
</button>
```

### Step 3.4: Render dialog

After `PublishDialog`:

```tsx
<ExploreDialog isOpen={showExploreDialog} onClose={() => setShowExploreDialog(false)} />
```

### Step 3.5: Type-check and commit

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx tsc --noEmit
```

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(desktop): wire ExploreDialog into JetBeeApp

- Adds 'Explore MixHive' button and dialog"
```

---

## Task 4: Delete legacy App.tsx

**Files:**
- Delete: `apps/desktop/src/App.tsx`

### Step 4.1: Verify no imports reference App.tsx

```bash
cd /home/kilisan/beehive-studio
grep -R "from ['\"]./App['\"]" apps/desktop/src || true
grep -R "import App" apps/desktop/src || true
```

Expected: no matches.

### Step 4.2: Delete file

```bash
rm apps/desktop/src/App.tsx
```

### Step 4.3: Run desktop tests

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx vitest run --reporter=verbose
```

Expected: all tests pass (no App.tsx tests).

### Step 4.4: Commit

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/App.tsx
git commit -m "chore(desktop): remove legacy App.tsx

- JetBeeApp.tsx is the single entry point"
```

---

## Task 5: Add TasteGraph core types to core-models

**Files:**
- Modify: `packages/core-models/index.ts`

### Step 5.1: Append types

At the end of `packages/core-models/index.ts`, add:

```typescript
// ============================================
// Taste Graph (self-evolving agent memory)
// ============================================

export type TasteNodeKind =
  | 'reference_track'
  | 'midi_motif'
  | 'groove_pattern'
  | 'sound_texture'
  | 'rejected_idea';

export type TasteEdgeKind =
  | 'sounds_like'
  | 'evolved_from'
  | 'rejected_because'
  | 'used_in'
  | 'inspired_by';

export interface TasteNode {
  id: ID;
  kind: TasteNodeKind;
  label: string;
  createdAt: number;
  projectId: string;
  sourceArtifactId?: ID;
  featureVector?: number[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface TasteEdge {
  id: ID;
  sourceId: ID;
  targetId: ID;
  kind: TasteEdgeKind;
  weight: number;
  updatedAt: number;
}

export interface TasteQueryResult {
  nodes: TasteNode[];
  summary: string;
}

export interface TasteFeedbackPayload {
  projectId: string;
  clipId: ID;
  verdict: 'like' | 'never_again';
  nodeKind?: TasteNodeKind;
  label?: string;
  featureVector?: number[];
  tags?: string[];
}
```

### Step 5.2: Type-check desktop

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx tsc --noEmit
```

### Step 5.3: Commit

```bash
cd /home/kilisan/beehive-studio
git add packages/core-models/index.ts
git commit -m "feat(models): add TasteGraph types

- TasteNode, TasteEdge, TasteQueryResult, TasteFeedbackPayload"
```

---

## Task 6: Implement TasteGraph in agent orchestrator

**Files:**
- Create: `services/agent-orchestrator/taste_graph/__init__.py`
- Create: `services/agent-orchestrator/taste_graph/embeddings.py`
- Create: `services/agent-orchestrator/taste_graph/store.py`
- Create: `services/agent-orchestrator/taste_graph/graph.py`

### Step 6.1: Create `taste_graph/embeddings.py`

```python
"""Simple, dependency-light feature extraction for MIDI clips."""

from __future__ import annotations

import math
from typing import Any


def extract_midi_features(notes: list[dict[str, Any]]) -> list[float]:
    """Return a normalized feature vector for a list of note dicts."""
    if not notes:
        return [0.0] * 8

    pitches = [n["pitch"] for n in notes]
    velocities = [n["velocity"] for n in notes]
    durations = [n["duration"] for n in notes]
    starts = [n["start"] for n in notes]

    pitch_hist = [0.0] * 12
    for p in pitches:
        pitch_hist[p % 12] += 1.0
    total = sum(pitch_hist) or 1.0
    pitch_hist = [c / total for c in pitch_hist]

    density = len(notes) / (max(starts) + max(durations)) if (starts and durations) else 0.0
    avg_velocity = sum(velocities) / len(velocities) / 127.0
    avg_duration = sum(durations) / len(durations) / 4.0
    avg_pitch = sum(pitches) / len(pitches) / 127.0

    # Reduce 12-D chroma to 4-D via octave grouping for cheap similarity.
    return [
        sum(pitch_hist[0:3]),    # tonic-ish
        sum(pitch_hist[3:6]),    # 3rd-ish
        sum(pitch_hist[6:9]),    # 5th-ish
        sum(pitch_hist[9:12]),   # leading/extension
        min(1.0, density / 8.0),
        avg_velocity,
        min(1.0, avg_duration),
        avg_pitch,
    ]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
```

### Step 6.2: Create `taste_graph/store.py`

```python
"""JSON persistence for TasteGraph."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


TASTE_GRAPH_VERSION = "1"


def project_graph_path(project_id: str) -> Path:
    safe = "".join(c for c in project_id if c.isalnum() or c in "-_") or "untitled"
    base = Path.home() / ".local/share/beehive-studio/projects" / safe / ".beehive"
    base.mkdir(parents=True, exist_ok=True)
    return base / "taste-graph.json"


def user_graph_path() -> Path:
    base = Path.home() / ".local/share/beehive-studio"
    base.mkdir(parents=True, exist_ok=True)
    return base / "taste-passport.json"


def load_graph(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("version") != TASTE_GRAPH_VERSION:
            data = {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}
        return data
    except Exception:
        return {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}


def save_graph(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def merge_into_user(project_data: dict[str, Any], user_data: dict[str, Any]) -> dict[str, Any]:
    """Merge project graph into user passport (simple additive merge)."""
    existing_ids = {n["id"] for n in user_data.get("nodes", [])}
    for node in project_data.get("nodes", []):
        if node["id"] not in existing_ids:
            user_data.setdefault("nodes", []).append(node)
    existing_edge_ids = {e["id"] for e in user_data.get("edges", [])}
    for edge in project_data.get("edges", []):
        if edge["id"] not in existing_edge_ids:
            user_data.setdefault("edges", []).append(edge)
    return user_data
```

### Step 6.3: Create `taste_graph/graph.py`

```python
"""TasteGraph: self-evolving creative memory for agents."""

from __future__ import annotations

import time
import uuid
from typing import Any

from taste_graph.embeddings import cosine_similarity, extract_midi_features
from taste_graph.store import load_graph, project_graph_path, save_graph, user_graph_path, merge_into_user


class TasteGraph:
    def __init__(self, project_id: str, data: dict[str, Any] | None = None) -> None:
        self.project_id = project_id
        self._path = project_graph_path(project_id)
        self._data = data or load_graph(self._path)
        self._nodes: dict[str, dict[str, Any]] = {n["id"]: n for n in self._data.get("nodes", [])}
        self._edges: dict[str, dict[str, Any]] = {e["id"]: e for e in self._data.get("edges", [])}

    def save(self) -> None:
        self._data["nodes"] = list(self._nodes.values())
        self._data["edges"] = list(self._edges.values())
        save_graph(self._path, self._data)

    def export_to_user(self) -> None:
        user_path = user_graph_path()
        user_data = load_graph(user_path)
        merged = merge_into_user(self._data, user_data)
        save_graph(user_path, merged)

    def add_node(
        self,
        kind: str,
        label: str,
        source_artifact_id: str | None = None,
        feature_vector: list[float] | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        node = {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "label": label,
            "createdAt": time.time(),
            "projectId": self.project_id,
            "sourceArtifactId": source_artifact_id,
            "featureVector": feature_vector or [],
            "tags": tags or [],
            "metadata": metadata or {},
        }
        self._nodes[node["id"]] = node
        return node

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        kind: str,
        weight: float = 1.0,
    ) -> dict[str, Any]:
        edge = {
            "id": str(uuid.uuid4()),
            "sourceId": source_id,
            "targetId": target_id,
            "kind": kind,
            "weight": weight,
            "updatedAt": time.time(),
        }
        self._edges[edge["id"]] = edge
        return edge

    def query(
        self,
        intent: str,
        exclude_ids: list[str] | None = None,
        top_k: int = 3,
        feature_vector: list[float] | None = None,
    ) -> dict[str, Any]:
        exclude = set(exclude_ids or [])
        candidates = [n for n in self._nodes.values() if n["id"] not in exclude and n["kind"] != "rejected_idea"]

        if feature_vector:
            scored = [
                (n, cosine_similarity(feature_vector, n.get("featureVector") or []))
                for n in candidates
            ]
        else:
            # Intent keyword matching fallback.
            intent_words = set(intent.lower().split())
            scored = []
            for n in candidates:
                label_words = set(n.get("label", "").lower().split())
                tag_words = set(" ".join(n.get("tags", [])).lower().split())
                score = len(intent_words & (label_words | tag_words)) / max(1, len(intent_words))
                scored.append((n, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top = [n for n, _ in scored[:top_k]]
        summary = f"Retrieved {len(top)} taste reference(s) for intent: {intent[:60]}"
        return {"nodes": top, "summary": summary}

    def add_feedback(
        self,
        verdict: str,
        source_artifact_id: str | None = None,
        label: str | None = None,
        feature_vector: list[float] | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if verdict == "like":
            node = self.add_node(
                kind="midi_motif",
                label=label or "liked motif",
                source_artifact_id=source_artifact_id,
                feature_vector=feature_vector,
                tags=tags or [],
                metadata=metadata,
            )
            # Reinforce similar existing nodes.
            similar = self.query(
                intent="",
                feature_vector=feature_vector,
                top_k=3,
                exclude_ids=[node["id"]],
            )["nodes"]
            for ref in similar:
                self.add_edge(ref["id"], node["id"], "inspired_by", weight=1.2)
            return node

        if verdict == "never_again":
            node = self.add_node(
                kind="rejected_idea",
                label=label or "rejected idea",
                source_artifact_id=source_artifact_id,
                feature_vector=feature_vector,
                tags=tags or ["rejected"],
                metadata=metadata,
            )
            similar = self.query(
                intent="",
                feature_vector=feature_vector,
                top_k=3,
                exclude_ids=[node["id"]],
            )["nodes"]
            for ref in similar:
                self.add_edge(ref["id"], node["id"], "rejected_because", weight=2.0)
            return node

        raise ValueError(f"unknown verdict: {verdict}")
```

### Step 6.4: Create `taste_graph/__init__.py`

```python
from taste_graph.graph import TasteGraph
from taste_graph.embeddings import extract_midi_features

__all__ = ["TasteGraph", "extract_midi_features"]
```

### Step 6.5: Write tests

Create `services/agent-orchestrator/tests/test_taste_graph.py`:

```python
import pytest
from taste_graph import TasteGraph, extract_midi_features


def test_extract_midi_features_returns_8d():
    notes = [
        {"pitch": 36, "velocity": 100, "start": 0, "duration": 0.25},
        {"pitch": 40, "velocity": 90, "start": 0.5, "duration": 0.25},
    ]
    vec = extract_midi_features(notes)
    assert len(vec) == 8
    assert all(0 <= v <= 1 for v in vec)


def test_add_and_query_node(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    graph = TasteGraph("test-project")
    node = graph.add_node("midi_motif", "dark bass", tags=["dark", "bass"])
    graph.save()

    graph2 = TasteGraph("test-project")
    result = graph2.query("dark bass", top_k=3)
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["label"] == "dark bass"


def test_like_feedback_strengthens_similar(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    graph = TasteGraph("test-project")
    ref = graph.add_node("midi_motif", "existing motif", feature_vector=[1.0] * 8)
    graph.save()

    graph2 = TasteGraph("test-project")
    node = graph2.add_feedback(
        verdict="like",
        label="liked motif",
        feature_vector=[0.99] * 8,
    )
    edges = [e for e in graph2._edges.values() if e["targetId"] == node["id"]]
    assert len(edges) >= 1
    assert edges[0]["kind"] == "inspired_by"
```

### Step 6.6: Run tests

```bash
cd /home/kilisan/beehive-studio/services/agent-orchestrator
python -m pytest tests/test_taste_graph.py -v
```

Expected: all pass.

### Step 6.7: Commit

```bash
cd /home/kilisan/beehive-studio
git add services/agent-orchestrator/taste_graph services/agent-orchestrator/tests/test_taste_graph.py
git commit -m "feat(orchestrator): TasteGraph core module

- Simple MIDI feature vectors
- Project + user passport persistence
- Like/Never-Again feedback with edge reinforcement"
```

---

## Task 7: Add HTTP endpoints for TasteGraph

**Files:**
- Modify: `services/agent-orchestrator/api/main.py`

### Step 7.1: Add Pydantic models and imports

Add imports near the top:

```python
from taste_graph import TasteGraph, extract_midi_features
```

Add request models after existing models:

```python
class TasteQueryRequest(BaseModel):
    project_id: str
    intent: str
    top_k: int = 3
    feature_vector: list[float] | None = None


class TasteFeedbackRequest(BaseModel):
    project_id: str
    clip_id: str
    verdict: str  # "like" | "never_again"
    label: str = ""
    feature_vector: list[float] | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}
```

### Step 7.2: Add endpoints

Add before `if __name__ == "__main__"` (or at end of file):

```python
@app.post("/taste/query")
async def taste_query(req: TasteQueryRequest):
    graph = TasteGraph(req.project_id)
    rejected = [n["id"] for n in graph._nodes.values() if n["kind"] == "rejected_idea"]
    result = graph.query(
        intent=req.intent,
        exclude_ids=rejected,
        top_k=req.top_k,
        feature_vector=req.feature_vector,
    )
    return {"status": "ok", "nodes": result["nodes"], "summary": result["summary"]}


@app.post("/taste/feedback")
async def taste_feedback(req: TasteFeedbackRequest):
    if req.verdict not in {"like", "never_again"}:
        raise HTTPException(status_code=400, detail="verdict must be 'like' or 'never_again'")
    graph = TasteGraph(req.project_id)
    node = graph.add_feedback(
        verdict=req.verdict,
        source_artifact_id=req.clip_id,
        label=req.label,
        feature_vector=req.feature_vector,
        tags=req.tags,
        metadata=req.metadata,
    )
    graph.save()
    graph.export_to_user()
    return {"status": "ok", "node_id": node["id"]}


@app.get("/taste/{project_id}")
async def taste_get(project_id: str):
    graph = TasteGraph(project_id)
    return {
        "status": "ok",
        "nodes": list(graph._nodes.values()),
        "edges": list(graph._edges.values()),
    }
```

### Step 7.3: Test endpoint

```bash
curl -s -X POST http://127.0.0.1:9876/taste/feedback \
  -H "Content-Type: application/json" \
  -d '{"project_id":"test","clip_id":"c1","verdict":"like","label":"dark bass","feature_vector":[0.8,0.1,0.1,0,0.5,0.7,0.2,0.3],"tags":["bass"]}' | python -m json.tool

curl -s "http://127.0.0.1:9876/taste/test" | python -m json.tool
```

Expected: returns node list with one liked node.

### Step 7.4: Commit

```bash
cd /home/kilisan/beehive-studio
git add services/agent-orchestrator/api/main.py
git commit -m "feat(orchestrator): HTTP endpoints for TasteGraph

- POST /taste/query
- POST /taste/feedback
- GET /taste/{project_id}"
```

---

## Task 8: Integrate TasteGraph into agents

**Files:**
- Modify: `services/agent-orchestrator/agents/drums.py`
- Modify: `services/agent-orchestrator/agents/melody.py`
- Modify: `services/agent-orchestrator/agents/rhythm_groove.py`

### Step 8.1: Modify drum agent

At the top, add:

```python
from taste_graph import TasteGraph, extract_midi_features
```

In `run_drum_agent`, after parsing request/context, before generation:

```python
    project_id = session_context.get("project_id", "default")
    graph = TasteGraph(project_id)
    query = graph.query(brief, top_k=2)
    taste_refs = query["nodes"]

    # Append taste context to reasoning.
    if taste_refs:
        reasoning.append(f"Taste references: {', '.join(n['label'] for n in taste_refs)}")
```

After generating notes, add the result to the graph:

```python
    features = extract_midi_features(notes)
    motif = graph.add_node(
        kind="groove_pattern",
        label=brief or f"{style} drums",
        feature_vector=features,
        tags=[style],
    )
    for ref in taste_refs:
        graph.add_edge(ref["id"], motif["id"], "inspired_by", weight=1.0)
    graph.save()
```

(Repeat analogous changes for `melody.py` and `rhythm_groove.py`, using `kind="midi_motif"` for melody and `kind="groove_pattern"` for rhythm_groove.)

### Step 8.2: Run agent tests

```bash
cd /home/kilisan/beehive-studio/services/agent-orchestrator
python -m pytest tests/test_smoke.py tests/test_taste_graph.py -v
```

Expected: pass.

### Step 8.3: Commit

```bash
cd /home/kilisan/beehive-studio
git add services/agent-orchestrator/agents
git commit -m "feat(orchestrator): agents query and populate TasteGraph

- Drums, Melody, Rhythm & Groove agents retrieve taste references
- Generated clips are added back to the graph"
```

---

## Task 9: Add desktop TasteGraph API client

**Files:**
- Create: `apps/desktop/src/lib/tasteGraphApi.ts`

### Step 9.1: Create API client

```typescript
import type { TasteFeedbackPayload, TasteQueryResult } from "../../../packages/core-models/index";

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
    body: JSON.stringify({ project_id: projectId, intent, top_k: topK, feature_vector: featureVector }),
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
```

### Step 9.2: Commit

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/lib/tasteGraphApi.ts
git commit -m "feat(desktop): TasteGraph API client

- queryTaste and sendTasteFeedback wrappers"
```

---

## Task 10: Add Like/Never-Again UI

**Files:**
- Create: `apps/desktop/src/components/TasteGraph/LikeButton.tsx`
- Modify: `apps/desktop/src/components/SessionView/SessionViewGrid.tsx` (or wherever clip rows render)

### Step 10.1: Create LikeButton

```tsx
import { useState } from "react";
import { sendTasteFeedback } from "../../lib/tasteGraphApi";
import type { TasteFeedbackPayload } from "../../../../packages/core-models/index";

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
        title="Like — teach my taste"
        onClick={() => handle("like")}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#4ade80" }}
      >
        ♥
      </button>
      <button
        title="Never again — avoid this style"
        onClick={() => handle("never_again")}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444" }}
      >
        ✕
      </button>
    </span>
  );
}
```

### Step 10.2: Mount LikeButton on clip rows

Locate where `SessionViewGrid` renders clip items. Add `LikeButton` next to existing action buttons. Pass a payload derived from the clip:

```tsx
<LikeButton
  payload={{
    projectId: projectName,
    clipId: clip.id,
    verdict: "like",
    label: clip.name,
    featureVector: clip.midiData ? extractFeatures(clip.midiData.notes) : undefined,
    tags: clip.metadata?.tags || [],
  }}
/>
```

If `extractFeatures` is not available, import from a new helper `apps/desktop/src/lib/tasteFeatures.ts`:

```typescript
export function extractFeatures(notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>): number[] {
  if (!notes.length) return new Array(8).fill(0);
  const pitches = notes.map((n) => n.pitch);
  const velocities = notes.map((n) => n.velocity);
  const durations = notes.map((n) => n.duration);
  const starts = notes.map((n) => n.start);
  const hist = new Array(12).fill(0);
  pitches.forEach((p) => hist[p % 12]++);
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const density = notes.length / (Math.max(...starts) + Math.max(...durations));
  return [
    hist.slice(0, 3).reduce((a, b) => a + b, 0) / total,
    hist.slice(3, 6).reduce((a, b) => a + b, 0) / total,
    hist.slice(6, 9).reduce((a, b) => a + b, 0) / total,
    hist.slice(9, 12).reduce((a, b) => a + b, 0) / total,
    Math.min(1, density / 8),
    velocities.reduce((a, b) => a + b, 0) / velocities.length / 127,
    Math.min(1, durations.reduce((a, b) => a + b, 0) / durations.length / 4),
    pitches.reduce((a, b) => a + b, 0) / pitches.length / 127,
  ];
}
```

### Step 10.3: Type-check and commit

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx tsc --noEmit
```

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/TasteGraph apps/desktop/src/lib/tasteFeatures.ts apps/desktop/src/components/SessionView/SessionViewGrid.tsx
git commit -m "feat(desktop): Like/Never-Again clip feedback

- Teaches TasteGraph from the Session View"
```

---

## Task 11: Add TastePanel UI

**Files:**
- Create: `apps/desktop/src/components/TasteGraph/TastePanel.tsx`
- Create: `apps/desktop/src/components/TasteGraph/index.ts`
- Modify: `apps/desktop/src/JetBeeApp.tsx`

### Step 11.1: Create TastePanel

```tsx
import { useEffect, useState } from "react";
import { queryTaste } from "../../lib/tasteGraphApi";
import type { TasteNode } from "../../../../packages/core-models/index";

interface Props {
  projectId: string;
}

export function TastePanel({ projectId }: Props) {
  const [nodes, setNodes] = useState<TasteNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    queryTaste(projectId, "", undefined, 10)
      .then((result) => setNodes(result.nodes))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div style={{ padding: 12, fontSize: 12, color: "#e0e0e0" }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Taste Memory</div>
      {loading && <div style={{ color: "#888" }}>Loading...</div>}
      {error && <div style={{ color: "#ef4444" }}>{error}</div>}
      {nodes.length === 0 && !loading && <div style={{ color: "#888" }}>No taste memory yet. Like or reject clips to build it.</div>}
      {nodes.map((n) => (
        <div key={n.id} style={{ marginBottom: 6, padding: 6, background: "#18181c", borderRadius: 4 }}>
          <span style={{ color: n.kind === "rejected_idea" ? "#ef4444" : "#4ade80" }}>●</span>{" "}
          {n.label} <span style={{ color: "#888" }}>({n.kind})</span>
        </div>
      ))}
    </div>
  );
}
```

### Step 11.2: Create barrel export

```typescript
export { LikeButton } from "./LikeButton";
export { TastePanel } from "./TastePanel";
```

### Step 11.3: Mount panel in JetBeeApp

Import:

```typescript
import { TastePanel } from "./components/TasteGraph";
```

Add a tab or side panel rendering `<TastePanel projectId={projectName} />` in an appropriate layout area (e.g., next to BuildConsole or ProjectPanel). Use existing panel/tab patterns.

### Step 11.4: Type-check and commit

```bash
cd /home/kilisan/beehive-studio/apps/desktop
npx tsc --noEmit
```

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/TasteGraph apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(desktop): TastePanel shows agent taste memory

- Lists liked motifs and rejected ideas per project"
```

---

## Task 12: End-to-end verification

### Step 12.1: Restart gateway and orchestrator

```bash
cd /home/kilisan/beehive-studio
pkill -f "uvicorn main:app --host 127.0.0.1 --port 9000" || true
pkill -f "uvicorn api.main:app --host 0.0.0.0 --port 9876" || true
# Start orchestrator
cd services/agent-orchestrator
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 9876 &
# Start gateway
cd /home/kilisan/beehive-studio/apps/api
python -m uvicorn main:app --host 127.0.0.1 --port 9000 &
```

### Step 12.2: Verify gateway health

```bash
curl -s http://127.0.0.1:9000/health | python -m json.tool
```

Expected: `beehive-local` ready.

### Step 12.3: Verify end-to-end build

```bash
curl -s -X POST http://127.0.0.1:9000/projects/demo/builds \
  -H "Content-Type: application/json" \
  -d '{"project_id":"demo","project_revision":0,"intent":"rolling techno bass","source":"test","selected_artifact_ids":[],"artifacts":[],"compiler_preference":"auto","allow_cloud":false,"cloud_approved":false}' | python -m json.tool
```

Capture the `id`, then approve:

```bash
curl -s -X POST http://127.0.0.1:9000/projects/demo/builds/<BUILD_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{"project_revision":0,"cloud_approved":false}' | python -m json.tool
```

Wait 5s, then check the artifact path exists:

```bash
ls -lh ~/.local/share/beehive-studio/projects/demo/assets/builds/
```

Expected: `.wav` and `.mid` files exist.

### Step 12.4: Run full test suite

```bash
cd /home/kilisan/beehive-studio
just test
```

Expected: passes.

### Step 12.5: Final commit

```bash
cd /home/kilisan/beehive-studio
git add -A
git commit -m "test(jetbee): end-to-end verification and green test suite

- Gateway beehive-local round-trip verified
- TasteGraph feedback/query endpoints verified
- just test passes"
```

---

## Self-review checklist

- [ ] **Spec coverage:** every design section has a task.
- [ ] **No placeholders:** every step has code or exact commands.
- [ ] **Type consistency:** `TasteNode`, `TasteEdge`, `TasteQueryResult` match between Python and TypeScript.
- [ ] **No drift:** `BeehiveLocalProvider` protocol matches `CompilerProvider`.
- [ ] **Tests:** new provider and TasteGraph have unit tests; full suite runs at end.
