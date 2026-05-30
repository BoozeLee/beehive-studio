# Rhythm & Groove Agent — Detailed Spec (Sprint 1 Focus)

**Role**: `rhythm_groove`  
**Version**: v1 (MVP)  
**Owner**: Primary specialist for the first vertical slice.

---

## Purpose

The Rhythm & Groove Agent is responsible for generating coherent, dancefloor-functional percussion, bass, and groove-oriented MIDI material that aligns with Beehive Studio underground/ritual aesthetics (techno, acid, psychedelic, rolling, swung, dark, driving).

For Sprint 1 it is the **only** specialist agent. All other roles are future work.

---

## Input Contract

The agent receives:

```python
{
  "brief": str,                    # Natural language creative direction
  "session_context": {
    "bpm": float,
    "time_signature": {"numerator": int, "denominator": int},
    "swing": float,                # 0.0 – 1.0
    "key_hint"?: str,              # e.g. "A minor", "F# phrygian"
    "existing_clips_summary"?: str # High-level description of what's already in the session
  },
  "style_references": list[str]    # Tags or short descriptions from Beehive Studio graph (stub for MVP)
}
```

**Example brief**:
"142 BPM rolling acid techno bassline, heavy swung 16ths, dark ritual tension, low-end focus, for ÆNIMAL set opening"

---

## Output Contract

The agent must return a fully populated `AgentTask` (see core models) where:

- `output_clip_ids` contains one or more new `Clip` ids.
- `reasoning` is a list of human-readable steps (minimum 3–5 sentences).
- The produced `Clip`(s) have valid `midi_data` (`MidiClipData` with `notes`).

**MIDI Requirements for "Valid" in Sprint 1**:
- 4 to 16 bars long.
- Correct BPM (the clip should be usable at the session BPM).
- Proper application of swing (16th-note swing between 0.5 and 0.75 is typical for rolling techno).
- Musical coherence: repeating motif with variation, appropriate register for the part (bass = low, percussion = mid-high).
- No obviously broken data (negative durations, pitches outside 0-127, etc.).

---

## Tools the Agent Can Use (MVP)

The agent has access to these Python tools (implemented in `tools/midi_tools.py`):

```python
def generate_rolling_bass(
    bpm: int,
    density: float,      # 0.0–1.0 (how many notes per beat on average)
    swing: float,        # 0.0–1.0
    darkness: float,     # 0.0–1.0 (affects pitch register + velocity)
    bars: int = 4,
    key: str = "A minor"
) -> list[MidiNote]:
    """Returns a list of MidiNote objects for a rolling bass/groove pattern."""

def apply_swing(notes: list[MidiNote], swing_amount: float) -> list[MidiNote]:
    ...

def quantize(notes: list[MidiNote], grid: str = "16th") -> list[MidiNote]:
    ...
```

The LLM (via structured output or tool calling) decides the parameters and calls the tools. The final MIDI is always validated and repaired by the tool layer before being returned.

---

## Example Few-Shot / Prompt Guidance (to be placed in `prompts/system/rhythm_groove_v1.md`)

(High-level guidance — actual prompt file will be created in A4 stubs.)

You are an expert underground techno and ritual music rhythm programmer.

Your output must be danceable, hypnotic, and have clear forward motion even at high densities.

When the user asks for "rolling", prioritize constant 16th-note motion with strategic accents and occasional larger intervals.

Always respect the requested BPM and swing amount. Swing is your friend for groove.

Never produce robotic straight-16th patterns unless explicitly asked for "straight" or "machine-like".

---

## Success Criteria for Sprint 1

The agent is considered working for the vertical slice when:

1. Given a realistic brief at 128–145 BPM with swing, it produces a 4–8 bar MIDI clip.
2. The clip plays back audibly in the desktop Session View without errors.
3. The `reasoning` field contains at least 4 distinct, understandable steps (e.g. "Chose low register for darkness", "Applied 68% swing to 16ths", "Created 2-bar motif then varied it on repetition", "Used tool X with parameters Y").
4. The user can request "variations" (re-run with slightly different temperature or follow-up instruction) and get a meaningfully different but still coherent result.
5. All output passes basic musical validation (no crashes, reasonable density, correct timing).

---

## Iteration & Human-in-the-Loop (MVP)

- The desktop will show the reasoning list immediately.
- "Accept" → clip stays in the session.
- "Give me variations" → re-invoke the same agent with the previous brief + "make it [darker / more rolling / less busy]" appended.
- "Reject" → discard the clip and task.

This loop is the core creative experience we are validating in Sprint 1.

---

**This spec is the primary expansion from the Pre-Sprint 1 Review.** It will be used directly when implementing `agents/rhythm_groove.py` and the supporting tools.