# Beehive Studio — Honest Limitations & Known Constraints

This document exists because the founding prompt demanded it.

We will keep this document brutally honest and update it as we learn.

---

## Audio & Playback Fidelity (Current)

- **Tone.js** is used for the MVP playback engine.
- This gives **instant local auditioning** with zero setup — a major win for the creative loop.
- It is **not** professional DAW audio quality. Expect:
  - Limited polyphony in complex sessions
  - No advanced warping, time-stretching, or high-quality sample playback
  - Web Audio API latency characteristics (better on some systems than others)
- Real export pipelines to actual DAWs (Ableton, Bitwig, Reaper, etc.) are the intended long-term escape hatch.

**Phased mitigation**:
1. Excellent MIDI + clear export (Sprint 1+)
2. Higher quality web-based instruments / WebAssembly synths
3. Optional native audio engine bridge (much later)

---

## VST / AU / External Plugin Hosting

**We do not support hosting third-party VSTs or Audio Units in the foreseeable future.**

Reasons:
- Enormous technical and licensing complexity
- Cross-platform nightmares
- Security surface area
- Conflicts with the local-first / privacy ethos

**Current instruments** will be Tone.js-based or simple sample playback.

**Future options** (not promises):
- Send MIDI + automation data to external DAWs via export or (much later) some form of ReWire-like protocol
- Dedicated lightweight instrument server process

---

## Local Neural Audio Models

High-quality, low-latency, real-time neural audio generation (voice, texture, full stems) on consumer hardware is still emerging technology as of 2026.

Current reality:
- Good for offline generation of interesting material
- Often too slow or too high-latency for tight creative loops inside a performance-oriented Session View
- Quality is highly model- and hardware-dependent

**Our stance**:
- We will use them where they genuinely add value (texture generation, atmosphere, one-shot processing).
- We will never pretend they are production-ready mastering tools.
- MIDI + symbolic generation remains the primary fast creative path.

---

## Agent Intelligence & Hallucination

Even with excellent prompting and tool use, the agents will:
- Sometimes generate musically nonsensical material
- Misunderstand your aesthetic references
- Require multiple iterations

This is expected. The entire human-in-the-loop + reasoning trace system exists precisely because of this.

We are building a **collaborative instrument**, not an autonomous composer.

---

## Scope vs Professional DAWs

Beehive Studio will **never** try to be a 1:1 replacement for Ableton Live, Bitwig, or Logic in terms of:
- Plugin ecosystem
- Mastering-grade audio engine
- Advanced warping/elastic audio
- Massive session scale (hundreds of tracks with complex routing)

Our bet is that for a specific aesthetic (Beehive Studio ritual/underground electronic music) and a specific workflow (heavy agent collaboration + deep human creative direction), we can create something **more powerful** than general-purpose DAWs in that niche.

Outside that niche, traditional DAWs will remain superior for many years.

---

## Performance Expectations (Early Versions)

- Agent reasoning can take anywhere from 3–30+ seconds depending on model and prompt complexity.
- The strict `marco-o1:latest` Hive 999 advisor can exceed its default
  90-second deadline on an 8 GB GTX 1080. Studio visibly degrades to its
  deterministic tools when the sidecar is unavailable, invalid, or too slow.
- Complex sessions with many generative clips + real-time playback may feel heavy.
- The desktop is a Tauri app — it will use more RAM than a native DAW in the early days.

We will optimize ruthlessly after the creative loop feels magical.

## Agent Transparency

- The UI exposes concise rationales, confidence, alternatives, evidence,
  warnings, model attribution, and latency.
- It does not expose or request hidden chain-of-thought, scratchpads, or
  internal monologues. Those are neither a reliable explanation surface nor a
  supported integration contract.

---

## Data & Privacy

- Everything is local by default.
- There is no cloud sync, no telemetry, and no account system.
- If you choose to use external models (NVIDIA NIM, future Laboratory models via MCP, etc.), those calls are opt-in and logged.
- Your Beehive Studio graph (your personal aesthetic/ritual knowledge) never leaves your machine unless you explicitly export it.

---

## Windows Support

Current Beehive GUI is macOS-primary. Beehive Studio will likely follow a similar path initially (best experience on macOS and Linux first).

Windows support is not a priority for the first 6–12 months.

---

## What We Are *Not* Building (at least not soon)

- A general-purpose DAW
- A VST host
- An autonomous "make me a full track" button
- A social/collaborative cloud platform
- A replacement for existing MIDI controllers or hardware

---

## What Success Actually Looks Like

Success is not "we have more features than Ableton."

Success is:

> A ritual artist or techno producer can sit down with Beehive Studio, give it fragments of their aesthetic language and high-level intent, and have it act as a tireless, transparent, stylistically coherent creative partner that still feels like *their* music — only faster and deeper than they could explore alone.

We will judge every decision against that standard.

---

**This document will be updated every time we discover a new painful truth.**

Last updated: 2026-05-30 (Initial)
