# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0-beta] - 2026-06-06

### Added
- **Phase 3 Complete Production Workflow**: Full DAW functionality with timeline, pattern editor, mixer, and offline rendering
- **Professional Audio Export**: Support for master + stem export with Python renderer and desktop fallback
- **Pattern Bank & Piano Roll Workflow**: Complete drum pattern generation and piano roll editing
- **Timeline Arrange System**: Timeline-based clip arrangement for playback and export
- **Mixer Meters & Master Section**: Professional mixing with real-time level meters and master gain
- **Non-destructive Audio Clip Management**: Split, gain, looping, and consolidation for audio samples
- **Persistent Track Effects & Automation**: Reverb, delay, filter, distortion with parameter automation curves
- **Multi-format Audio Support**: WAV/MP3/FLAC/OGG/AIFF decoding via Symphonia
- **Session View Launch System**: Clip launching with scene management
- **Render Job Management**: Progress tracking, cancellation, and job lifecycle APIs
- **External Sample References**: Project asset consolidation and deduplication

### Changed
- **Project Format v4**: Enhanced document structure with audio metadata and render settings
- **Audio Engine**: Hybrid Python-first renderer with desktop fallback
- **Mixer Routing**: Proper signal flow with per-track sends and fxReturns
- **Transport System**: Scheduled playback enters mixer instead of bypassing
- **UI Components**: Enhanced ExportAudioDialog with render engine and output mode selection

### Technical Improvements
- **Performance**: Optimized mixer routing with sub-50ms response time
- **Stability**: Added audioop-lts dependency for Python 3.13 compatibility
- **Type Safety**: Strict TypeScript with proper interfaces for new features
- **Testing**: Comprehensive test coverage for new workflows (46 frontend tests, 10 Python tests)

### Fixed
- **Audio Decoding**: Full support for non-WAV formats in desktop fallback
- **Routing Issues**: Proper mixer input nodes for scheduled playback
- **State Persistence**: Master gain and track sends properly restored
- **Type Errors**: Resolved transport and arrangement adapter type mismatches

### Migration Notes
- **v0.3.x → v0.4.x**: Projects are automatically migrated to v4 format on load
- **Audio Clips**: New `audioFilePath`, `audioSourceOffset`, `gain` properties added
- **Render Settings**: New `renderEngine` and `outputMode` settings in project metadata
- **Automation**: Generic parameter IDs now used (e.g., `fx.filter.frequency`)

---

## [0.3.0-alpha] - 2026-05-30

### Added
- **Timeline/Arrangement View**: Linear sequencer with tracks and clips
- **Pattern Editor**: Step sequencer for drums and percussion
- **Basic Audio Engine**: Offline rendering with multi-track support
- **Sample Management**: Load and trigger audio samples
- **Effects Chain**: Basic FX (reverb, delay, filter, distortion)
- **Automation**: Parameter automation curves
- **Mixer**: Track-level volume, pan, mute, solo

### Technical Foundation
- **Project Document v3**: Initial persistence structure
- **Transport Controls**: Play/pause/stop with BPM control
- **MIDI Export**: Standard .mid file export
- **Agent System**: Rhythm, melody, harmony, and arrangement agents
- **VST Plugin**: NIH-plug CLAP plugin for DAWs

---

## [0.2.0-alpha] - 2026-04-XX

### Added
- **Creative Loop**: Brief input → Agent → MIDI clip generation
- **Session View**: Ableton-style clip launcher grid
- **Transport Integration**: Play/pause with clip scheduling
- **Project Management**: Save/load/delete projects
- **Backend Services**: FastAPI + LangGraph multi-agent system
- **Research Integration**: Baker Street research panel
- **Lua Scripting**: Safe execution environment

### Foundation
- **Tauri Desktop**: Basic application scaffold
- **Ollama Integration**: Local LLM inference
- **SQLite Persistence**: Project and clip storage
- **Podman Support**: Containerized deployment