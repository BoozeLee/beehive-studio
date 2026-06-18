# Beehive Studio

**A hybrid JetBrains-grade intelligent creative environment + Ableton Live-grade performance instrument, powered by sophisticated local multi-agent systems for underground ritual and dancefloor music.**

> "Agents as first-class creative collaborators, not black-box generators."

---

## Current Status: Phase 3 Complete ✅

**Version: 0.4.0-beta**
**Date:** 2026-06-06

Beehive Studio is now a **fully functional digital audio workstation (DAW)** with professional features:

### 🎵 Core DAW Features
- **Timeline/Arrangement View**: Linear sequencer with multi-track editing
- **Pattern Editor**: Step sequencer for drum programming and percussion
- **Professional Mixer**: 32-track mixer with real-time meters, sends, and effects
- **Audio Engine**: Hybrid Python-first renderer with desktop fallback
- **Sample Management**: Non-destructive slicing, looping, and consolidation
- **Persistent Automation**: Parameter curves for volume, pan, FX, and sends
- **Session View**: Ableton-style clip launcher with scene management

### 🤖 Multi-Agent System
- **Rhythm & Groove**: Bassline and drum pattern generation
- **Melody**: Scale-based melodic composition
- **Harmony**: Chord progression and arrangement
- **Drum Programming**: Intelligent drum pattern generation
- **Sound Design**: Synth patch generation via description

### 🔊 Audio Features
- **Multi-format Support**: WAV/MP3/FLAC/OGG/AIFF decoding
- **Professional Export**: Master + stem rendering with LUFS normalization
- **Real-time Processing**: Sub-50ms mixer latency
- **Effects Chain**: Reverb, delay, filter, distortion with automation
- **MIDI Export**: Standard .mid file export

---

## Getting Started

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Python 3.11+
- uv (Python package manager)
- Ollama (for AI inference)

### Quick Start

```bash
# Clone and install
git clone https://github.com/BoozeLee/beehive-studio.git
cd beehive-studio
just install  # Installs all dependencies and launcher

# Start services
just backend       # Python FastAPI backend on port 9876
just desktop-dev   # Tauri desktop app

# Or run tests
just test      # All alpha gates (frontend + backend + packaging)
```

### Optional Hive 999 Marco-o1 Advisor

Rhythm & Groove can use the local Hive 999 sidecar for attributed creative
advice while Studio retains deterministic MIDI and QA authority:

```bash
cd /home/kilisan/beeai-hive-999
scripts/install_advisor_service.sh
curl http://127.0.0.1:17999/api/v1/health
```

Studio remains usable and displays a degraded proposal when the advisor is
unavailable or times out. See
[`docs/SPRINT_1_MARCO_INTEGRATION.md`](docs/SPRINT_1_MARCO_INTEGRATION.md).

### Project Template
```bash
# Create new project with default template
just new-project "My Techno Track"
```

---

## Migration Guide

### Upgrading from v0.3.x
Projects are automatically migrated to v4 format on first load. No manual action required.

### Key Changes
- **Audio Clips**: New `audioFilePath`, `audioSourceOffset`, `gain` properties
- **Render Settings**: New `renderEngine` (python/desktop) and `outputMode` (master/stems) options
- **Automation**: Generic parameter IDs (e.g., `fx.filter.frequency`) instead of specific effect names
- **Project Files**: Enhanced with metadata for audio samples and render presets

### Backward Compatibility
- v0.2-v0.3 projects can be imported via File → Import Legacy Project
- All MIDI clips and arrangements remain compatible
- Audio files are automatically referenced and consolidated

---

## Documentation

### Living Documents
- [Architecture](./docs/ARCHITECTURE.md) — System design and agent workflows
- [Roadmap](./ROADMAP.md) — Phase 4+ plans and future features
- [Changelog](./CHANGELOG.md) — Detailed version history
- [Developer Guide](./docs/DEVELOPER_GUIDE.md) — Contribution guidelines

### Agent Development
- [Agent SDK](./docs/AGENT_SDK.md) — Create custom music agents
- [Lua API](./docs/LUA_API.md) — Scripting reference for audio engine
- [Plugin Development](./docs/PLUGIN_DEVELOPMENT.md) — VST plugin integration

---

## Features in Detail

### 🎹 Timeline & Arrangement
- **Multi-track Editing**: Add, remove, and arrange MIDI/audio clips
- **Non-destructive Operations**: Split, duplicate, and move clips without losing data
- **Automation Lanes**: Draw parameter curves for volume, pan, and effects
- **Quantized Editing**: Snap to grid for precise rhythm alignment

### 🥁 Pattern Editor
- **16-Step Sequencer**: Visual drum programming with velocity control
- **Swing & Groove**: Humanize patterns with swing percentage
- **Pattern Bank**: Save and organize drum patterns
- **Send to Timeline**: Convert patterns to MIDI clips

### 🎚️ Mixer
- **32-Channel Mixer**: Professional mixing with gain, pan, mute, solo
- **Sends & Returns**: Reverb and delay bus routing
- **Real-time Meters**: Peak and RMS level monitoring
- **Effects Chain**: Insert effects per track with automation

### 🤖 Multi-Agent System
- **Brief-to-Clip**: Describe your idea → generate complete arrangement
- **Interactive Agents**: Real-time collaboration with AI
- **Agent History**: Review and iterate on generated content
- **Quality Assurance**: Built-in validation and feedback

### 🔊 Audio Engine
- **Python Renderer**: High-quality audio rendering with stem export
- **Desktop Fallback**: Local rendering when Python unavailable
- **Format Support**: WAV, MP3, FLAC, OGG, AIFF import/export
- **LUFS Normalization**: Professional loudness standards

---

## Performance

| Metric | Current | Target |
|--------|---------|---------|
| Cold start time | ~3s | <1s |
| Clip generation | ~5s | <2s |
| Audio latency | ~50ms | <10ms |
| Max tracks | 32 | 64 |
| Max clips per project | 500 | 1000 |
| Export formats | MIDI + WAV + FLAC | + MP3 + OGG |

---

## Community & Support

### Contributing
- GitHub Issues: Bug reports and feature requests
- Pull Requests: Code contributions welcome
- Agent Development: Create and share custom agents

### Community Channels
- **GitHub**: Discussions and issue tracking
- **Discord**: Real-time chat and support
- **Matrix**: `#beehive-studio:matrix.org`

### Examples
- **Techno Production**: Complete workflow from idea to mastered track
- **Live Performance**: Session View setup for DJ/live sets
- **Sound Design**: Agent-assisted synthesis and sampling

---

## License

All Rights Reserved. See [LICENSE](./LICENSE).

This is a portfolio project. Source is publicly viewable but not licensed for reuse, modification, or distribution without written permission.

---

**Built for underground ritual music production with the seriousness of professional development tools.**

Let's create the future of AI-assisted music production.
