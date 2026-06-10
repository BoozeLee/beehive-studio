# Beehive Studio

**A hybrid JetBrains-grade intelligent creative environment + Ableton Live-grade performance instrument, powered by sophisticated local multi-agent systems for underground ritual and dancefloor music.**

> "Agents as first-class creative collaborators, not black-box generators."

---

## Current Status

**Phase 0 (Mandatory Discovery)**: Complete.  
Full architectural audit of the existing Beehive codebase was performed. See `docs/PHASE0_BEEHIVE_AUDIT_FOR_Beehive Studio.md` (sibling to this repo during early development).

**This is pre-alpha research software.** Nothing is stable. Everything can (and will) change.

---

## The Vision (from the founding prompt)

Beehive Studio aims to become a unified desktop platform that seamlessly blends:

- **JetBrains-grade** intelligent development and agent configuration tooling for music.
- **Ableton Live-grade** music production and performance interface (Session View + Arrangement View).
- A production-grade **multi-agent generative music system** purpose-built for Beehive Studio aesthetics (techno, acid, psychedelic, co-production, event narration, Rhythmic Ritual, ÆNIMAL).

Everything must remain **local-first** by default, with agents that are transparent, explainable, and fully under human creative control.

---

## Quick Links (Living Documents)

- [Phase 0 Audit](./docs/PHASE0_BEEHIVE_AUDIT_FOR_Beehive Studio.md) — What we learned from the existing Beehive codebase
- [Architecture](./docs/ARCHITECTURE.md) — High-level system design + agent state machine
- [Directory Structure](./docs/DIRECTORY_STRUCTURE.md) — Why things are where they are
- [Sprint 1 Plan](./docs/SPRINT_1_PLAN.md) — The first vertical slice (Rhythm & Groove agent → audible MIDI clip)
- [Limitations](./docs/LIMITATIONS.md) — Honest constraints (read this)

---

## Core Principles

1. Human creative control is sacred.
2. Local-first and privacy-preserving by default.
3. Agents must show their work.
4. Every action is reversible.
5. The Beehive Studio graph (your personal ritual/aesthetic knowledge) is a first-class citizen.

---

## Getting Started (Once Sprint 1 is Ready)

See the Sprint 1 Plan for the current target.

Typical early dev flow (subject to change):

```bash
# Terminal 1 — Agent brain
cd services/agent-orchestrator
uv run uvicorn api.main:app --reload

# Terminal 2 — Desktop
cd apps/desktop
npm install
npm run tauri dev
```

Ollama must be running with at least one reasonable model.

---

## Relationship to Beehive

Beehive Studio is a **new sibling project**, not a fork or replacement of the published [Beehive](https://www.beehiveapp.dev) coding agent workspace tool.

We learned an enormous amount from Beehive's engineering (especially the resilient multi-pane workspace system, PTY/agent launching patterns, and Tauri v2 discipline). Those lessons are being selectively reused, but the product identity, data model, and creative domain are fundamentally different.

The existing Beehive remains untouched and continues its own life.

---

## Contributing & Agent Instructions

See `AGENTS.md` in the root (once written) for how to work on this codebase with AI coding agents.

---

## License

All Rights Reserved. See [LICENSE](./LICENSE).

This is a portfolio project. Source is publicly viewable but not licensed for reuse, modification, or distribution without written permission.

---

## Monetization

**Beehive Studio** is developed as part of the Bakery Street ecosystem.

- **GitHub Sponsors**: Support development at [github.com/sponsors/BoozeLee](https://github.com/sponsors/BoozeLee)
- **Mixhive Pro Bundle**: €29/month (Personal) | €99/month (Studio)
- **Commercial Licensing**: Available for teams and enterprises

See [COMMERCIAL.md](./COMMERCIAL.md) for details.

---

**This project exists because someone wanted a tool that treats underground ritual music generation with the same seriousness that professional developers treat code, and the same immediacy that Ableton Live gives performers.**

Let's build it properly.
