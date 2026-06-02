# Changelog

## v1.0.0-prep (2026-06-01)

### Features
- 11 agent types: rhythm, drums, harmony, melody, arrangement, style, texture, mixing, sound design, mastering, sample curator
- Custom Web Audio scheduler (Tone.js removed) with <10ms latency
- FLAC + MP3 + WAV audio export
- Multi-track stem export
- VST3 + CLAP plugin support
- Real-time agent reasoning trace
- Error boundary with crash recovery
- Loading spinner indicators
- Cold start eliminated (background process spawning)
- WebSocket session sync for real-time collaboration

### Performance
- 32-track voice pool (128 polyphonic voices)
- 500-clip virtual scrolling timeline
- Agent result caching (256 entries, 5min TTL)
- Clip generation timeout (10s asyncio fallback)
- Incremental project save (upsert by clip ID)
- Performance profiler instrumentation

### Quality
- 123 frontend tests (11 files)
- 14 Rust tests (audio, sample, MIDI, git commands)
- 347 Python tests (all agents + API + cache)
- TypeScript strict mode (0 errors)
- Rust clippy clean (0 warnings)
- All pre-existing flaky tests fixed

### Infrastructure
- GitHub Actions CI (lint + test + build on push)
- GitHub Actions release workflow (deb + AppImage + VST)
- AUR PKGBUILD for Arch Linux
- Agent API documentation (docs/AGENT_API.md)
