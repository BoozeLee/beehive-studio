use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use plugin_marketplace::{PluginCategory, PluginMetadata, PluginPrice, PluginRegistry};
use serde_json::Value;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use chrono::Utc;

#[tokio::main]
async fn main() {
    // Initialize tracing (omitted)

    // Create registry and add mock plugins
    let registry = Arc::new(PluginRegistry::new());
    
    let mock_plugins = vec![
        PluginMetadata {
            id: "plg-1".to_string(),
            name: "HiveVerb".to_string(),
            description: "A lush, algorithmic reverb optimized for vocal tracks and wide synths.".to_string(),
            author: "Beehive DSP".to_string(),
            version: "1.0.0".to_string(),
            category: PluginCategory::Effect,
            tags: vec!["reverb".to_string(), "spatial".to_string()],
            price: PluginPrice::Free,
            downloads: 1205,
            rating: 4.8,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            wasm_hash: "abc".to_string(),
            wasm_size: 2048,
        },
        PluginMetadata {
            id: "plg-2".to_string(),
            name: "BuzzSynth".to_string(),
            description: "Wavetable synthesizer with honey-smooth filters and aggressive unison modes.".to_string(),
            author: "Marco Audio".to_string(),
            version: "2.1.0".to_string(),
            category: PluginCategory::Synthesizer,
            tags: vec!["synth".to_string(), "wavetable".to_string(), "bass".to_string()],
            price: PluginPrice::OneTime { price_cents: 2900 },
            downloads: 450,
            rating: 4.9,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            wasm_hash: "def".to_string(),
            wasm_size: 5048,
        },
        PluginMetadata {
            id: "plg-3".to_string(),
            name: "AutoChorder AI".to_string(),
            description: "AI-assisted chord progression generator that adapts to your track's key and energy.".to_string(),
            author: "MixHive AI Labs".to_string(),
            version: "0.9.5".to_string(),
            category: PluginCategory::AiAgent,
            tags: vec!["ai".to_string(), "chords".to_string(), "midi".to_string()],
            price: PluginPrice::Subscription { monthly_cents: 499 },
            downloads: 8900,
            rating: 4.5,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            wasm_hash: "ghi".to_string(),
            wasm_size: 8096,
        },
    ];

    for p in mock_plugins {
        registry.register_plugin(p, None).unwrap();
    }

    // Configure CORS so the React app on 5173 can talk to it
    let cors = CorsLayer::permissive();

    // Build the router
    let app = Router::new()
        .route("/health", get(|| async { Json(serde_json::json!({ "status": "ok" })) }))
        .route("/api/plugins", get(list_plugins))
        .route("/api/plugins/{id}/install", post(install_plugin))
        // Mock endpoints for tracks (to support PublishDialog)
        .route("/api/tracks", post(mock_publish_track))
        .layer(cors)
        .with_state(registry);

    // Run the server
    let listener = tokio::net::TcpListener::bind("127.0.0.1:18888").await.unwrap();
    println!("🚀 Mock Rust Backend running on http://127.0.0.1:18888");
    axum::serve(listener, app).await.unwrap();
}

async fn list_plugins(State(registry): State<Arc<PluginRegistry>>) -> Json<Vec<PluginMetadata>> {
    Json(registry.list_plugins().unwrap_or_default())
}

async fn install_plugin() -> Json<Value> {
    Json(serde_json::json!({ "status": "installed" }))
}

async fn mock_publish_track(Json(payload): Json<Value>) -> Json<Value> {
    println!("Received publish request: {:#?}", payload);
    Json(serde_json::json!({
        "track_id": format!("trk-{}", uuid::Uuid::new_v4()),
        "url": "https://mixhive.app/track/mock",
        "status": "published"
    }))
}
