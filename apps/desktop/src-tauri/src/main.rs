#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_commands;
mod asset_commands;
mod git_commands;
mod sample_commands;

use serde::Serialize;

#[derive(Serialize)]
struct BackendResponse {
    task_id: String,
    status: String,
    reasoning: Vec<String>,
    clip_preview: serde_json::Value,
}

/// Send a brief to the local agent orchestrator and return the generated clip.
#[tauri::command]
async fn send_brief(
    brief: String,
    session_context: serde_json::Value,
) -> Result<BackendResponse, String> {
    let client = reqwest::Client::new();
    let url = "http://127.0.0.1:9876/brief";

    let body = serde_json::json!({
        "brief": brief,
        "session_context": session_context,
    });

    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to backend: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse backend response: {}", e))?;

    let task_id = data["task_id"].as_str().unwrap_or("unknown").to_string();
    let status = data["status"].as_str().unwrap_or("unknown").to_string();
    let reasoning: Vec<String> = data["reasoning"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let clip_preview = data["clip_preview"].clone();

    Ok(BackendResponse {
        task_id,
        status,
        reasoning,
        clip_preview,
    })
}

/// Check if the backend is healthy.
#[tauri::command]
async fn check_backend_health() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = "http://127.0.0.1:9876/health";

    match client.get(url).send().await {
        Ok(response) if response.status().is_success() => {
            let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
            Ok(data)
        }
        _ => Err("Backend not responding".to_string()),
    }
}

/// Execute a Lua script via the backend.
#[tauri::command]
async fn run_lua_script(script: String, session_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = "http://127.0.0.1:9876/lua/run";

    let body = serde_json::json!({
        "script": script,
        "session_id": session_id,
    });

    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to backend: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data)
}

/// Call Baker Street for web-grounded research.
#[tauri::command]
async fn do_research(query: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = "http://127.0.0.1:9876/research";

    let body = serde_json::json!({
        "query": query,
        "mode": "quick",
        "agent": "creative",
    });

    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to backend: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data)
}

/// Read file bytes from disk.
#[tauri::command]
async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Write file bytes to disk.
#[tauri::command]
async fn write_file_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    tokio::fs::write(&path, &data)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Generic agent request to any backend endpoint.
#[tauri::command]
async fn send_agent_request(
    endpoint: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:9876/{}", endpoint);

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to backend: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data)
}

#[tauri::command]
async fn backend_request(
    method: String,
    endpoint: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:9876/{}", endpoint.trim_start_matches('/'));
    let request = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "DELETE" => client.delete(&url),
        _ => client.post(&url),
    };
    let response = if let Some(value) = body {
        request.json(&value).send().await
    } else {
        request.send().await
    }
    .map_err(|e| format!("Failed to connect to backend: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }
    response.json().await.map_err(|e| format!("Failed to parse backend response: {}", e))
}

/// Export MIDI file via backend, copy to user-selected location.
#[tauri::command]
async fn export_midi(
    clips: Vec<serde_json::Value>,
    bpm: u32,
    filename: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = "http://127.0.0.1:9876/export/midi";

    let body = serde_json::json!({
        "clips": clips,
        "bpm": bpm,
        "filename": filename,
    });

    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to backend: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Backend returned error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if data["status"] != "ok" {
        return Err(data["message"]
            .as_str()
            .unwrap_or("Export failed")
            .to_string());
    }

    let temp_path = data["path"].as_str().unwrap_or("").to_string();
    if temp_path.is_empty() {
        return Err("Backend did not return a file path".to_string());
    }

    // Return the temp path — frontend will use Tauri's dialog plugin to save
    Ok(temp_path)
}

// ─────────────────────────────────────────────────────────────
// MIDI I/O
// ─────────────────────────────────────────────────────────────

use std::sync::{Arc, Mutex};
use tauri::Emitter;

static MIDI_INPUT: Mutex<Option<midir::MidiInputConnection<()>>> = Mutex::new(None);

/// List available MIDI input ports.
#[tauri::command]
fn list_midi_ports() -> Result<Vec<String>, String> {
    let midi_in = midir::MidiInput::new("Beehive Studio MIDI Input")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();
    let names: Vec<String> = ports
        .iter()
        .map(|p| {
            midi_in
                .port_name(p)
                .unwrap_or_else(|_| "Unknown".to_string())
        })
        .collect();

    Ok(names)
}

/// Open a MIDI input port and stream events to the frontend.
#[tauri::command]
fn open_midi_input(port_index: usize, app: tauri::AppHandle) -> Result<(), String> {
    let midi_in = midir::MidiInput::new("Beehive Studio MIDI Input")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();
    let port = ports.get(port_index).ok_or("Invalid port index")?;

    let app_handle = Arc::new(app);

    let conn = midi_in
        .connect(
            port,
            "beehive-midi-in",
            move |_timestamp, message, _| {
                // Emit MIDI event to frontend
                let event = serde_json::json!({
                    "bytes": message,
                });
                let _ = app_handle.emit("midi-event", event);
            },
            (),
        )
        .map_err(|e| format!("Failed to connect MIDI input: {}", e))?;

    let mut guard = MIDI_INPUT.lock().unwrap();
    *guard = Some(conn);

    Ok(())
}

/// Close the active MIDI input connection.
#[tauri::command]
fn close_midi_input() -> Result<(), String> {
    let mut guard = MIDI_INPUT.lock().unwrap();
    *guard = None;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            send_brief,
            check_backend_health,
            run_lua_script,
            do_research,
            export_midi,
            read_file_bytes,
            write_file_bytes,
            send_agent_request,
            backend_request,
            list_midi_ports,
            open_midi_input,
            close_midi_input,
            audio_commands::write_wav_file,
            audio_commands::export_audio_stems,
            asset_commands::consolidate_project_assets,
            asset_commands::resolve_project_asset,
            sample_commands::get_sample_info,
            sample_commands::load_sample,
            git_commands::git_init_project,
            git_commands::git_save_snapshot,
            git_commands::git_list_branches,
            git_commands::git_create_branch,
            git_commands::git_checkout_branch,
            git_commands::git_log,
            git_commands::git_diff,
            git_commands::git_revert,
            git_commands::git_export_tarball,
            git_commands::git_import_tarball,
            git_commands::git_current_branch,
            git_commands::git_fork_session,
            git_commands::git_fork_from_commit,
            git_commands::git_read_clips,
            git_commands::git_read_clips_at,
            git_commands::git_merge_branch,
            git_commands::git_delete_branch,
            git_commands::git_rename_branch,
            git_commands::git_branch_notes,
            git_commands::git_log_for_branch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
