# Beehive Studio for VS Code

An agentic music production IDE inside VS Code. Beehive Studio turns the editor into a creative workstation for symbolic music composition: generate MIDI patterns with AI agents, arrange them on a timeline, manage creative branches, and publish to MixHive — all local-first.

## Features

- **Studio webview** — full DAW-like surface with dashboard, agent console, timeline, pattern editor, mixer, session view, and taste graph.
- **AI agents** — run orchestrator-backed agents (drums, melody, rhythm & groove, and more) directly from the activity bar or command palette.
- **Build pipeline** — create and approve JetBee builds, with live events from the local gateway.
- **Taste Graph** — teach the system your preferences with Like / Never-Again feedback; agents retrieve your taste memory before generating.
- **Project tree view** — discover and open `.beehive` projects from the workspace.
- **Command palette integration** — every action reachable via `Ctrl/Cmd+Shift+P` → "Beehive".
- **Keyboard shortcuts** — open studio, ask agent, build project, and toggle transport from the keyboard.

## Requirements

- VS Code 1.120.0+
- Local Beehive services running:
  - JetBee gateway on `http://127.0.0.1:9000`
  - Agent orchestrator on `http://127.0.0.1:9876`
  - Ollama with a model like `openchat:7b` (configured in orchestrator)

## Extension Settings

This extension contributes the following settings:

- `beehive.enabled`: Enable/disable Beehive features.
- `beehive.gatewayUrl`: URL of the JetBee gateway.
- `beehive.orchestratorUrl`: URL of the agent orchestrator.
- `beehive.websocketUrl`: URL of the gateway event WebSocket.
- `beehive.defaultModel`: Default AI model identifier.

## Known Issues

- The timeline, pattern editor, and mixer are scaffolded in the webview and will be fully ported from the Tauri desktop app in a future release.
- Cloud render APIs are not integrated; use the export/MixHive path for final audio.

## Release Notes

### 0.5.0

- Initial VS Code extension IDE shell.
- Typed gateway + orchestrator backend clients.
- Webview message bridge and Zustand state stores.
- Functional dashboard, agent console, taste graph, and settings pages.
- Project/agent/session/task tree views in the activity bar.
- Command palette, keybindings, and status bar integration.
