# Phase 2 Smoke Test Checklist

## Environment
- VS Code 1.120+
- Beehive gateway running on `http://127.0.0.1:9000`
- Beehive orchestrator running on `http://127.0.0.1:9876`
- Ollama with `openchat:7b` loaded

## Install the extension
1. Build the VSIX: `cd extension && npm exec -y @vscode/vsce package -- --no-dependencies --allow-missing-repository`
2. Install `extension/beehive-studio-0.5.0.vsix` in VS Code via the Extensions panel → "Install from VSIX..."
3. Verify the Beehive activity bar icon appears.

## Project lifecycle
- [ ] Run `Beehive: New Project` from the command palette.
- [ ] Save a `.beehive` project file to a workspace folder.
- [ ] Verify the Studio panel opens and the Dashboard loads.
- [ ] Run `Beehive: Open Project` and reopen the same project.
- [ ] Run `Beehive: Close Project` and verify the UI returns to the empty state.

## Navigation
- [ ] Click each sidebar icon and confirm the route loads without errors:
  - [ ] Dashboard
  - [ ] Agent
  - [ ] Timeline
  - [ ] Pattern
  - [ ] Mixer
  - [ ] Session
  - [ ] Taste
  - [ ] Branches
  - [ ] Settings

## Build flow
- [ ] In the Dashboard, click **🔨 Build** or press `Ctrl+Shift+G`.
- [ ] Verify a build job appears in the bottom Build Console.
- [ ] Confirm WebSocket events update the build status/progress live.
- [ ] Open a build plan review if the build reaches `awaiting_approval`.

## Branch management
- [ ] Open the **Branches** view.
- [ ] Create a new branch from the branch selector.
- [ ] Switch between branches.
- [ ] Select a comparison branch and verify the diff view shows affected clips.

## Mixer
- [ ] Open the **Mixer** view.
- [ ] Verify channel strips appear for each track in the Timeline.
- [ ] Adjust volume/pan sliders.
- [ ] Toggle Mute / Solo / Arm buttons.
- [ ] Adjust the master fader and confirm the meter updates.

## Publish / Explore (optional — requires MixHive env vars)
- [ ] Set `BEEHIVE_MIXHIVE_URL`, `BEEHIVE_SUPABASE_URL`, `BEEHIVE_SUPABASE_ANON_KEY` in the environment before launching VS Code.
- [ ] In the Dashboard, click **🌐 Publish to MixHive**.
- [ ] Verify the health check runs; sign in if configured.
- [ ] Click **🔎 Explore MixHive** and confirm the track list loads.

## Health indicators
- [ ] Verify the TopBar shows Gateway and Orchestrator status dots.
- [ ] Confirm the Dashboard Health card reflects actual backend state.

## Cleanup
- [ ] Close the Studio panel.
- [ ] Uninstall the Beehive extension.
