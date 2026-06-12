# Sprint 1 Marco-o1 Integration

## Delivered Architecture

Beehive Studio uses Hive 999 as a loopback-only, strict Marco-o1 reasoning
advisor for Rhythm & Groove. Studio remains the authority for deterministic
parameter resolution, MIDI generation, QA, project state, and iteration.

Flow:

1. Studio sends the brief, session context, style references, and versioned
   Rhythm & Groove specialist prompt to Hive 999.
2. Hive combines it with its versioned orchestrator prompt and requests a
   validated CreativePlan from `marco-o1:latest`.
3. Studio fills only unspecified parameters from the plan, then generates and
   validates MIDI deterministically.
4. Desktop UI shows a summary-first proposal with model attribution,
   confidence, alternatives, warnings, and concise rationale.
5. On any sidecar error or timeout, Studio visibly returns a degraded proposal
   and continues with deterministic tools.

## Contracts And Ownership

- Hive owns the master orchestrator prompt and Marco runtime.
- Studio owns `prompts/system/rhythm_groove_v2_marco.md`.
- Hive is advisory only; it has no Studio state mutation capability.
- Prompt and response contracts prohibit hidden chain-of-thought, scratchpads,
  and internal monologues.
- Explicit user constraints always override advisor recommendations.

## Run

```bash
cd /home/kilisan/beeai-hive-999
scripts/install_advisor_service.sh

cd /home/kilisan/beehive-studio
just backend
just dev
```

Studio configuration:

```dotenv
BEEHIVE_HIVE999_URL=http://127.0.0.1:17999
BEEHIVE_HIVE999_TIMEOUT=95
```

## Acceptance

- Sidecar health and advisory API are loopback-only.
- Marco advice is attributed and schema-validated.
- Sidecar failure is visible but does not block rhythm generation.
- Explicit brief BPM and groove intent remain authoritative.
- Human audition remains required before any brief is considered musically
  accepted.
