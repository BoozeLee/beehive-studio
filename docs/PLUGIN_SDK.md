# Beehive Studio Plugin SDK

Welcome to the Beehive Studio Plugin SDK! This guide explains how to build custom Audio and MIDI plugins for the Beehive Studio IDE using WebAssembly (WASM).

## Architecture

Beehive Studio uses a sandboxed WASM runtime for all third-party plugins. This ensures:
1. **Safety**: Plugins cannot crash the host IDE.
2. **Security**: Sandboxing limits file system and network access by default.
3. **Cross-Platform**: Compile once to WASM, run anywhere Beehive Studio runs.

## The `Plugin` Core Concepts

All plugins must implement the core lifecycle hooks. Below is the conceptual Rust representation:

```rust
pub trait Plugin {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    
    // Lifecycle hooks
    fn init(&mut self, sample_rate: u32, buffer_size: usize) -> Result<(), PluginError>;
    fn process_audio(&mut self, buffer: &mut [f32]) -> Result<(), PluginError>;
    fn on_midi(&mut self, events: &[MidiEvent]) -> Result<(), PluginError>;
    fn cleanup(&mut self) -> Result<(), PluginError>;
}
```

### 1. `init`
Called once when the plugin is loaded or when the audio engine changes sample rates/buffer sizes.

### 2. `process_audio`
Called repeatedly on the high-priority audio thread. Processes interleaved stereo f32 samples in-place.
*⚠️ Warning: Do not allocate memory, use mutexes, or make system calls in this function.*

### 3. `on_midi`
Handles incoming MIDI events. Each event includes a timestamp, status byte, and data bytes.

### 4. `cleanup`
Called before the plugin is unloaded. Free up any manual resources here.

## Security Sandboxing

By default, plugins run with strict limitations:
* Max Memory: 256 MB
* Max CPU time per buffer: 5ms
* File System: Denied
* Network Access: Denied

You can request broader permissions in your plugin metadata, which users must explicitly approve upon installation.

## Marketplace & Stripe Integration

Beehive Studio integrates tightly with the **MixHive** ecosystem and **Stripe** for payments. 
When publishing a plugin, you can choose a pricing model:
* **Free**
* **One-Time Purchase**
* **Monthly Subscription**

The internal `PluginRegistry` handles license and subscription verification automatically. You just focus on the DSP!
