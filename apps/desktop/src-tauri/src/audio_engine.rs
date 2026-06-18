use beehive_audio_engine::mixer::Mixer;
use std::sync::{mpsc, Mutex};
use tauri::State;

/// Commands sent to the dedicated audio engine worker thread.
/// The worker owns the CPAL `Mixer` (which is not `Send`), so the Tauri
/// `State` only holds the channel sender, satisfying `Send + Sync`.
#[derive(Debug)]
pub enum Command {
    Init { resp: Responder<()> },
    AddTrack { resp: Responder<usize> },
    RemoveTrack { id: usize, resp: Responder<()> },
    SetGain { id: usize, gain: f32, resp: Responder<()> },
    SetPan { id: usize, pan: f32, resp: Responder<()> },
}

pub type Responder<T> = mpsc::SyncSender<Result<T, String>>;

fn spawn_audio_engine_worker() -> mpsc::Sender<Command> {
    let (tx, rx) = mpsc::channel::<Command>();
    std::thread::Builder::new()
        .name("beehive-audio-engine".to_string())
        .spawn(move || {
            let mut mixer: Option<Mixer> = None;
            while let Ok(cmd) = rx.recv() {
                match cmd {
                    Command::Init { resp } => match Mixer::new() {
                        Ok(m) => {
                            mixer = Some(m);
                            let _ = resp.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = resp.send(Err(e.to_string()));
                        }
                    },
                    Command::AddTrack { resp } => {
                        if let Some(m) = &mixer {
                            let _ = resp.send(Ok(m.add_track()));
                        } else {
                            let _ = resp.send(Err("mixer not initialized".to_string()));
                        }
                    }
                    Command::RemoveTrack { id, resp } => {
                        if let Some(m) = &mixer {
                            m.remove_track(id);
                            let _ = resp.send(Ok(()));
                        } else {
                            let _ = resp.send(Err("mixer not initialized".to_string()));
                        }
                    }
                    Command::SetGain { id, gain, resp } => {
                        if let Some(m) = &mixer {
                            m.set_track_gain(id, gain);
                            let _ = resp.send(Ok(()));
                        } else {
                            let _ = resp.send(Err("mixer not initialized".to_string()));
                        }
                    }
                    Command::SetPan { id, pan, resp } => {
                        if let Some(m) = &mixer {
                            m.set_track_pan(id, pan);
                            let _ = resp.send(Ok(()));
                        } else {
                            let _ = resp.send(Err("mixer not initialized".to_string()));
                        }
                    }
                }
            }
        })
        .expect("failed to spawn audio engine worker");
    tx
}

pub struct AudioEngineState {
    tx: Mutex<mpsc::Sender<Command>>,
}

impl AudioEngineState {
    pub fn new() -> Self {
        Self {
            tx: Mutex::new(spawn_audio_engine_worker()),
        }
    }
}

fn send_and_wait<T: Send + 'static>(
    state: &AudioEngineState,
    cmd: Command,
    resp_rx: mpsc::Receiver<Result<T, String>>,
) -> Result<T, String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    tx.send(cmd)
        .map_err(|e| format!("audio engine worker disconnected: {}", e))?;
    resp_rx
        .recv()
        .map_err(|e| format!("audio engine worker dropped response: {}", e))?
}

#[tauri::command]
pub fn audio_engine_init(state: State<AudioEngineState>) -> Result<String, String> {
    let (resp_tx, resp_rx) = mpsc::sync_channel(1);
    send_and_wait(&state, Command::Init { resp: resp_tx }, resp_rx)?;
    Ok("initialized".to_string())
}

#[tauri::command]
pub fn audio_engine_add_track(state: State<AudioEngineState>) -> Result<usize, String> {
    let (resp_tx, resp_rx) = mpsc::sync_channel(1);
    send_and_wait(&state, Command::AddTrack { resp: resp_tx }, resp_rx)
}

#[tauri::command]
pub fn audio_engine_set_gain(
    state: State<AudioEngineState>,
    track: usize,
    gain: f32,
) -> Result<(), String> {
    let (resp_tx, resp_rx) = mpsc::sync_channel(1);
    send_and_wait(
        &state,
        Command::SetGain {
            id: track,
            gain,
            resp: resp_tx,
        },
        resp_rx,
    )
}

#[tauri::command]
pub fn audio_engine_set_pan(
    state: State<AudioEngineState>,
    track: usize,
    pan: f32,
) -> Result<(), String> {
    let (resp_tx, resp_rx) = mpsc::sync_channel(1);
    send_and_wait(
        &state,
        Command::SetPan {
            id: track,
            pan,
            resp: resp_tx,
        },
        resp_rx,
    )
}

#[tauri::command]
pub fn audio_engine_start(_state: State<AudioEngineState>) -> Result<String, String> {
    // CPAL stream is already playing after init; this is a no-op for v0.5.0-alpha.
    Ok("started".to_string())
}

#[tauri::command]
pub fn audio_engine_stop(_state: State<AudioEngineState>) -> Result<String, String> {
    // Full stream stop/start is deferred to a later milestone.
    Ok("stopped".to_string())
}

#[tauri::command]
pub fn audio_engine_remove_track(
    state: State<AudioEngineState>,
    track: usize,
) -> Result<(), String> {
    let (resp_tx, resp_rx) = mpsc::sync_channel(1);
    send_and_wait(
        &state,
        Command::RemoveTrack {
            id: track,
            resp: resp_tx,
        },
        resp_rx,
    )
}

/// v0.5.0-alpha preview render stub.
/// Returns one second of silent stereo interleaved f32 samples.
/// A future milestone will feed the mixer and render real audio offline.
#[tauri::command]
pub fn render_preview_via_cpal(
    _tracks: serde_json::Value,
    _clips: serde_json::Value,
    _bpm: u32,
) -> Result<Vec<f32>, String> {
    let sample_rate = 44100_usize;
    let seconds = 1_usize;
    let total_samples = sample_rate * 2 * seconds;
    Ok(vec![0.0f32; total_samples])
}
