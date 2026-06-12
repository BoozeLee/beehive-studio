# Instructions for AI Coding Agents Working on Beehive Studio

This document exists so that future coding agents (Claude, GPT-class models, local agents, etc.) can work effectively and consistently on this project.

---

## Core Philosophy

Beehive Studio treats **underground ritual and dancefloor music** with the same seriousness that professional developers treat code.

Agents working on Beehive Studio must internalize:

- Human creative sovereignty is non-negotiable.
- Transparency and explainability are features, not nice-to-haves.
- Local-first and privacy are hard constraints, not marketing points.
- We would rather ship something smaller and honest than something large and misleading.

---

## Required Reading Before Writing Any Code

1. The original founding prompt (the long "Super Engineer Prompt" document that started the project).
2. `docs/PHASE0_BEEHIVE_AUDIT_FOR_Beehive Studio.md` — what we learned from the existing Beehive codebase.
3. `docs/ARCHITECTURE.md`
4. `docs/LIMITATIONS.md` (update it when you discover new painful truths).
5. `docs/SPRINT_1_PLAN.md` (while we are in early sprints).
6. `docs/SPRINT_1_MARCO_INTEGRATION.md` when changing agent inference.

---

## Naming & Aesthetic Conventions

- Use **Beehive Studio** when referring to the overall vision/system.
- Agent names and UI language should feel ritual, underground, precise, and slightly dangerous — never corporate or generic "AI music" marketing-speak.
- ÆNIMAL, Rhythmic Ritual, and related aesthetics are first-class references.

---

## Code Quality Rules

- Type safety is mandatory (TypeScript strict + Pydantic v2).
- Every major agent decision or UI component must have a short rationale comment or ADR.
- Never hide limitations. If something is slow, low-fidelity, or incomplete, surface it.
- Never expose or request hidden chain-of-thought. Use concise rationales,
  alternatives, confidence, evidence, and warnings.
- Hive 999 is an advisor only. Beehive Studio owns deterministic generation,
  QA, project state, and every user-visible mutation.
- Prefer boring, reliable technology over fashionable new things when they serve the creative loop.

---

## Agent Collaboration Patterns (Inside Beehive Studio)

When building agent features, always ask:

- Can the user see *why* this decision was made?
- Can the user rewind or branch this decision?
- Does this respect the current Beehive Studio references the user has loaded?
- Would a skilled ritual producer find this musically coherent even if they disagree with it?

---

## When in Doubt

Re-read the section in the founding prompt titled **"Quality Standards"**.

Then make the more conservative, more transparent, more human-controlled choice.

---

**Welcome to the project.**

Build something that feels like a real creative partner, not a content generator.
