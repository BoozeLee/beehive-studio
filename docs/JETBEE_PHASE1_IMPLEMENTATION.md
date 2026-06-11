# JetBee Phase 1 Implementation

## Canonical Build Flow

`Ctrl+Shift+G` creates one build through the JetBee gateway on port `9000`.
The gateway requests a validated plan from Hive 999, waits for explicit user
approval, selects an approved compiler provider, streams normalized events,
and ingests only completed artifacts.

Service responsibilities:

- Hive 999 (`17999`): planning supervisor; no mutation or execution authority.
- JetBee gateway (`9000`): build lifecycle, provider routing, and events.
- Studio orchestrator (`9876`): deterministic MIDI generation and QA.
- Desktop: project authority, patch review, Git checkpoints, and artifact use.

## Contracts

Shared build contracts live in `packages/core-models/index.ts` and
`apps/api/services/build_contracts.py`. JSON uses camelCase. Project documents
migrate to V5 with per-artifact `dsl` or `visual` ownership.

All Hive patches require confirmation. The desktop currently applies only
validated BPM parameter patches; unsupported patch operations are blocked.

## Providers

Routing for `auto` is local-only:

1. `ace-rest` at `ACESTEP_URL` (default `http://127.0.0.1:8001`)
2. `ace-cpp` at `JETBEE_ACE_CPP_URL` (default `http://127.0.0.1:8080`)

The C++ adapter is contract-complete but reports unavailable until a compatible
runtime is configured. `deapi-rest` and `deapi-mcp` are disabled by default and
never selected without explicit cloud approval.

Configuration:

```dotenv
ACESTEP_URL=http://127.0.0.1:8001
JETBEE_ACE_CPP_URL=http://127.0.0.1:8080
JETBEE_DEAPI_URL=
JETBEE_DEAPI_API_KEY=
JETBEE_DEAPI_MCP_URL=
```

## Run

```bash
systemctl --user start beeai-hive-advisor.service
just gateway
just backend
just dev
```

Or run `scripts/beehive-dev.sh` to start the gateway, deterministic backend,
and desktop together.

## Honest Limitations

- Marco-o1 may time out; the gateway returns a visible degraded direct-build
  plan.
- Phase 1 streams progress events, then completed artifacts. It does not stream
  playable audio chunks.
- deAPI MCP advertises capability only; execution remains unavailable until a
  configured MCP bridge exists.
- Project V5 assigns existing timeline material to visual ownership during
  migration. Ownership-transfer UI remains future work.
