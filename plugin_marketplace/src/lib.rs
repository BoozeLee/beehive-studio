//! # Plugin Marketplace
//!
//! Provides the plugin system for Beehive Studio IDE:
//! - `Plugin` trait with lifecycle hooks (init, process_audio, on_midi, cleanup)
//! - `PluginRegistry` for in-memory plugin management
//! - `PluginMetadata` for marketplace listings (name, author, price, etc.)
//! - Security sandboxing via WASM isolation
//!
//! ## Architecture
//! ```text
//! Plugin Developer → WASM binary → PluginRegistry → Beehive Studio audio pipeline
//!                                        ↕
//!                               Marketplace API (Stripe)
//! ```

pub mod wasm;
pub use wasm::WasmPlugin;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use thiserror::Error;
use tracing::info;
use uuid::Uuid;

// ─── Error Types ──────────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum PluginError {
    #[error("Plugin not found: {0}")]
    NotFound(String),

    #[error("Plugin already registered: {0}")]
    AlreadyRegistered(String),

    #[error("Plugin initialization failed: {0}")]
    InitFailed(String),

    #[error("Plugin sandbox violation: {0}")]
    SandboxViolation(String),

    #[error("Payment required for plugin: {0}")]
    PaymentRequired(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, PluginError>;

// ─── Plugin Trait ─────────────────────────────────────────────────────────────

/// Core trait that all Beehive Studio plugins must implement.
/// Designed for WASM-compatible plugins with audio/MIDI lifecycle hooks.
pub trait Plugin: Send + Sync {
    /// Plugin unique identifier.
    fn id(&self) -> &str;

    /// Human-readable name.
    fn name(&self) -> &str;

    /// Plugin version (semver).
    fn version(&self) -> &str;

    /// Initialize the plugin with the given sample rate and buffer size.
    fn init(&mut self, sample_rate: u32, buffer_size: usize) -> Result<()>;

    /// Process an audio buffer in-place (interleaved stereo f32 samples).
    fn process_audio(&mut self, buffer: &mut [f32]) -> Result<()>;

    /// Handle incoming MIDI events.
    /// Each event is a slice of bytes (e.g., [status, note, velocity]).
    fn on_midi(&mut self, events: &[MidiEvent]) -> Result<()>;

    /// Clean up resources when the plugin is unloaded.
    fn cleanup(&mut self) -> Result<()>;
}

// ─── Data Models ──────────────────────────────────────────────────────────────

/// A MIDI event passed to plugins.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiEvent {
    /// Timestamp in samples from buffer start.
    pub timestamp: u64,
    /// MIDI status byte.
    pub status: u8,
    /// MIDI data byte 1 (e.g., note number).
    pub data1: u8,
    /// MIDI data byte 2 (e.g., velocity).
    pub data2: u8,
}

/// Metadata for a plugin listing in the marketplace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub category: PluginCategory,
    pub tags: Vec<String>,
    pub price: PluginPrice,
    pub downloads: u64,
    pub rating: f32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// SHA-256 hash of the WASM binary for integrity verification.
    pub wasm_hash: String,
    /// Size of the WASM binary in bytes.
    pub wasm_size: u64,
}

/// Plugin categories for the marketplace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PluginCategory {
    Synthesizer,
    Effect,
    Analyzer,
    MidiProcessor,
    AiAgent,
    Sampler,
    Sequencer,
    Utility,
}

/// Pricing model for a plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginPrice {
    /// Free plugin.
    Free,
    /// One-time purchase (price in cents, e.g., 999 = €9.99).
    OneTime { price_cents: u64 },
    /// Monthly subscription (price in cents per month).
    Subscription { monthly_cents: u64 },
}

/// Security sandbox configuration for a plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    /// Maximum memory the plugin can allocate (bytes).
    pub max_memory_bytes: u64,
    /// Maximum CPU time per audio buffer (microseconds).
    pub max_cpu_us: u64,
    /// Whether the plugin can access the filesystem.
    pub allow_filesystem: bool,
    /// Whether the plugin can make network requests.
    pub allow_network: bool,
    /// Allowed WASM imports (function names).
    pub allowed_imports: Vec<String>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            max_memory_bytes: 256 * 1024 * 1024, // 256 MB
            max_cpu_us: 5000,                      // 5ms per buffer
            allow_filesystem: false,
            allow_network: false,
            allowed_imports: vec![
                "process_audio".into(),
                "on_midi".into(),
                "get_parameter".into(),
                "set_parameter".into(),
            ],
        }
    }
}

// ─── Plugin Registry ──────────────────────────────────────────────────────────

/// Thread-safe in-memory registry for managing installed plugins.
#[derive(Debug, Clone)]
pub struct PluginRegistry {
    /// Plugin metadata indexed by plugin ID.
    plugins: Arc<RwLock<HashMap<String, PluginMetadata>>>,
    /// Sandbox configurations per plugin.
    sandboxes: Arc<RwLock<HashMap<String, SandboxConfig>>>,
}

impl PluginRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        info!("Initializing plugin registry");
        Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            sandboxes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new plugin in the marketplace.
    pub fn register_plugin(
        &self,
        mut metadata: PluginMetadata,
        sandbox: Option<SandboxConfig>,
    ) -> Result<String> {
        let mut plugins = self
            .plugins
            .write()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        if plugins.contains_key(&metadata.id) {
            return Err(PluginError::AlreadyRegistered(metadata.id.clone()));
        }

        if metadata.id.is_empty() {
            metadata.id = Uuid::new_v4().to_string();
        }

        let id = metadata.id.clone();
        info!(plugin_id = %id, name = %metadata.name, "Registering plugin");

        plugins.insert(id.clone(), metadata);

        // Set sandbox config (use default if none provided)
        let mut sandboxes = self
            .sandboxes
            .write()
            .map_err(|e| PluginError::Internal(e.to_string()))?;
        sandboxes.insert(id.clone(), sandbox.unwrap_or_default());

        Ok(id)
    }

    /// Unregister a plugin by ID.
    pub fn unregister_plugin(&self, plugin_id: &str) -> Result<PluginMetadata> {
        let mut plugins = self
            .plugins
            .write()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        let metadata = plugins
            .remove(plugin_id)
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))?;

        let mut sandboxes = self
            .sandboxes
            .write()
            .map_err(|e| PluginError::Internal(e.to_string()))?;
        sandboxes.remove(plugin_id);

        info!(plugin_id, "Plugin unregistered");
        Ok(metadata)
    }

    /// Get a plugin's metadata by ID.
    pub fn get_plugin(&self, plugin_id: &str) -> Result<PluginMetadata> {
        let plugins = self
            .plugins
            .read()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        plugins
            .get(plugin_id)
            .cloned()
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))
    }

    /// List all registered plugins.
    pub fn list_plugins(&self) -> Result<Vec<PluginMetadata>> {
        let plugins = self
            .plugins
            .read()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        Ok(plugins.values().cloned().collect())
    }

    /// Search plugins by category.
    pub fn search_by_category(&self, category: &PluginCategory) -> Result<Vec<PluginMetadata>> {
        let plugins = self
            .plugins
            .read()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        Ok(plugins
            .values()
            .filter(|p| &p.category == category)
            .cloned()
            .collect())
    }

    /// Search plugins by tag.
    pub fn search_by_tag(&self, tag: &str) -> Result<Vec<PluginMetadata>> {
        let plugins = self
            .plugins
            .read()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        Ok(plugins
            .values()
            .filter(|p| p.tags.iter().any(|t| t.eq_ignore_ascii_case(tag)))
            .cloned()
            .collect())
    }

    /// Get the sandbox configuration for a plugin.
    pub fn get_sandbox_config(&self, plugin_id: &str) -> Result<SandboxConfig> {
        let sandboxes = self
            .sandboxes
            .read()
            .map_err(|e| PluginError::Internal(e.to_string()))?;

        sandboxes
            .get(plugin_id)
            .cloned()
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))
    }

    /// Total number of registered plugins.
    pub fn count(&self) -> usize {
        self.plugins.read().map(|p| p.len()).unwrap_or(0)
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_metadata(id: &str, name: &str, category: PluginCategory) -> PluginMetadata {
        PluginMetadata {
            id: id.to_string(),
            name: name.to_string(),
            description: format!("Test plugin: {}", name),
            author: "Test Author".to_string(),
            version: "0.1.0".to_string(),
            category,
            tags: vec!["test".to_string()],
            price: PluginPrice::Free,
            downloads: 0,
            rating: 0.0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            wasm_hash: "abc123".to_string(),
            wasm_size: 1024,
        }
    }

    #[test]
    fn test_register_and_list_plugins() {
        let registry = PluginRegistry::new();

        let meta1 = make_test_metadata("synth-1", "SuperSynth", PluginCategory::Synthesizer);
        let meta2 = make_test_metadata("fx-1", "ReverbMaster", PluginCategory::Effect);

        registry.register_plugin(meta1, None).unwrap();
        registry.register_plugin(meta2, None).unwrap();

        let all = registry.list_plugins().unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_duplicate_registration_fails() {
        let registry = PluginRegistry::new();
        let meta = make_test_metadata("dup-1", "DuplicatePlugin", PluginCategory::Utility);

        registry.register_plugin(meta.clone(), None).unwrap();
        let result = registry.register_plugin(meta, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_unregister_plugin() {
        let registry = PluginRegistry::new();
        let meta = make_test_metadata("rm-1", "RemovablePlugin", PluginCategory::Analyzer);

        registry.register_plugin(meta, None).unwrap();
        assert_eq!(registry.count(), 1);

        registry.unregister_plugin("rm-1").unwrap();
        assert_eq!(registry.count(), 0);
    }

    #[test]
    fn test_search_by_category() {
        let registry = PluginRegistry::new();

        let synth = make_test_metadata("s1", "Synth1", PluginCategory::Synthesizer);
        let fx = make_test_metadata("f1", "FX1", PluginCategory::Effect);
        let ai = make_test_metadata("a1", "AIHelper", PluginCategory::AiAgent);

        registry.register_plugin(synth, None).unwrap();
        registry.register_plugin(fx, None).unwrap();
        registry.register_plugin(ai, None).unwrap();

        let synths = registry
            .search_by_category(&PluginCategory::Synthesizer)
            .unwrap();
        assert_eq!(synths.len(), 1);
        assert_eq!(synths[0].name, "Synth1");
    }

    #[test]
    fn test_sandbox_config_default() {
        let registry = PluginRegistry::new();
        let meta = make_test_metadata("sb-1", "SandboxedPlugin", PluginCategory::Effect);

        registry.register_plugin(meta, None).unwrap();

        let config = registry.get_sandbox_config("sb-1").unwrap();
        assert!(!config.allow_filesystem);
        assert!(!config.allow_network);
        assert_eq!(config.max_memory_bytes, 256 * 1024 * 1024);
    }

    #[test]
    fn test_paid_plugin_pricing() {
        let price = PluginPrice::OneTime { price_cents: 999 };
        let json = serde_json::to_string(&price).unwrap();
        assert!(json.contains("999"));

        let sub = PluginPrice::Subscription { monthly_cents: 499 };
        let json2 = serde_json::to_string(&sub).unwrap();
        assert!(json2.contains("499"));
    }
}
