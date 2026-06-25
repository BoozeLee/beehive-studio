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

#[derive(serde::Serialize)]
pub struct RustRenderResult {
    pub master_path: String,
    pub stem_paths: Vec<String>,
    pub engine: String,
}

fn now_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

/// Real offline render via the Rust audio engine (replaces the Tone.js/Python
/// paths when `renderEngine === "rust"`). Decodes audio clips, renders master +
/// optional per-track stems, encodes to WAV/FLAC, writes files, returns paths.
#[tauri::command]
pub fn render_offline(
    clips: serde_json::Value,
    tracks: serde_json::Value,
    bpm: f64,
    preset: String,
    format: String,
    output_mode: String,
) -> Result<RustRenderResult, String> {
    use beehive_audio_engine::encode;
    use beehive_audio_engine::render::{self, AudioBuf, MixerTrack, RenderClip, RenderPreset};
    use std::collections::HashMap;

    let clips: Vec<RenderClip> = serde_json::from_value(clips).map_err(|e| format!("clips: {e}"))?;
    let tracks: Vec<MixerTrack> =
        serde_json::from_value(tracks).map_err(|e| format!("tracks: {e}"))?;
    let preset = RenderPreset::parse(&preset);
    let sample_rate = 44_100u32;

    // Decode each referenced audio file once.
    let mut audio_by_path: HashMap<String, AudioBuf> = HashMap::new();
    for c in &clips {
        if let Some(p) = &c.audio_file_path {
            if !audio_by_path.contains_key(p) {
                if let Ok((sr, ch, samples)) = crate::sample_commands::decode_audio(p) {
                    audio_by_path.insert(
                        p.clone(),
                        AudioBuf { sample_rate: sr, channels: ch, samples },
                    );
                }
            }
        }
    }

    let out = render::render_offline(&clips, &tracks, bpm, sample_rate, preset, &audio_by_path);

    let flac = format.eq_ignore_ascii_case("flac");
    let ext = if flac { "flac" } else { "wav" };
    let encode_buf = |buf: &[f32]| -> Result<Vec<u8>, String> {
        if flac {
            encode::encode_flac(buf, sample_rate, 2)
        } else {
            encode::encode_wav(buf, sample_rate, 2)
        }
    };

    let dir = std::env::temp_dir().join(format!("beehive-render-{}", now_ms()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let master_path = dir.join(format!("master.{ext}"));
    std::fs::write(&master_path, encode_buf(&out.master)?).map_err(|e| e.to_string())?;

    let mut stem_paths = Vec::new();
    if output_mode == "master_and_stems" {
        for stem in &out.stems {
            let safe: String = stem
                .name
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                .collect();
            let p = dir.join(format!("{safe}.{ext}"));
            std::fs::write(&p, encode_buf(&stem.samples)?).map_err(|e| e.to_string())?;
            stem_paths.push(p.to_string_lossy().to_string());
        }
    }

    Ok(RustRenderResult {
        master_path: master_path.to_string_lossy().to_string(),
        stem_paths,
        engine: "rust".into(),
    })
}

// ── Realtime playback (M2b) ─────────────────────────────────────────────────
// Lock-free Rust transport. The CPAL stream (not `Send`) lives on its own
// parked thread; the Tauri `State` holds only the `RtHandle` (ring-buffer
// producer + atomics), which is `Send`.

use beehive_audio_engine::realtime::{self, RtClip, RtCommand, RtHandle, RtNote};
use beehive_audio_engine::synth::osc_for_instrument;

pub struct RealtimeState {
    handle: Mutex<Option<RtHandle>>,
}

impl RealtimeState {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }
}

impl Default for RealtimeState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(serde::Deserialize)]
struct SchedNoteInput {
    pitch: u8,
    velocity: u8,
    start: f64,
    duration: f64,
}

#[derive(serde::Deserialize)]
struct SchedClipInput {
    #[serde(default)]
    notes: Vec<SchedNoteInput>,
    #[serde(default, rename = "startBeat")]
    start_beat: f64,
    #[serde(default)]
    channel: u32,
    #[serde(default)]
    instrument: Option<String>,
    #[serde(default)]
    gain: Option<f32>,
    #[serde(default)]
    pan: Option<f32>,
}

fn with_handle<F: FnOnce(&mut RtHandle)>(
    state: &State<RealtimeState>,
    f: F,
) -> Result<(), String> {
    let mut guard = state.handle.lock().map_err(|e| e.to_string())?;
    let h = guard.as_mut().ok_or("realtime engine not initialized")?;
    f(h);
    Ok(())
}

#[tauri::command]
pub fn realtime_init(state: State<RealtimeState>) -> Result<String, String> {
    let mut guard = state.handle.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok("already-initialized".into());
    }
    let (tx, rx) = mpsc::sync_channel::<Result<RtHandle, String>>(1);
    std::thread::spawn(move || match realtime::start_output(4096) {
        Ok((stream, handle)) => {
            if tx.send(Ok(handle)).is_ok() {
                // Keep the !Send CPAL stream alive on this thread.
                std::thread::park();
            }
            drop(stream);
        }
        Err(e) => {
            let _ = tx.send(Err(e));
        }
    });
    let handle = rx.recv().map_err(|e| e.to_string())??;
    *guard = Some(handle);
    Ok("initialized".into())
}

#[tauri::command]
pub fn transport_play(state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::Play);
    })
}

#[tauri::command]
pub fn transport_pause(state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::Pause);
    })
}

#[tauri::command]
pub fn transport_stop(state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::Stop);
    })
}

#[tauri::command]
pub fn transport_seek(beat: f64, state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::Seek(beat));
    })
}

#[tauri::command]
pub fn transport_set_bpm(bpm: f64, state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::SetBpm(bpm));
    })
}

#[tauri::command]
pub fn transport_clear_clips(state: State<RealtimeState>) -> Result<(), String> {
    with_handle(&state, |h| {
        h.send(RtCommand::ClearClips);
    })
}

#[tauri::command]
pub fn transport_schedule_clip(
    clip: serde_json::Value,
    state: State<RealtimeState>,
) -> Result<(), String> {
    let input: SchedClipInput = serde_json::from_value(clip).map_err(|e| e.to_string())?;
    let osc = osc_for_instrument(input.instrument.as_deref().unwrap_or("synth"));
    let rt_clip = RtClip {
        channel: input.channel,
        start_beat: input.start_beat,
        osc,
        gain: input.gain.unwrap_or(1.0),
        pan: input.pan.unwrap_or(0.0),
        notes: input
            .notes
            .into_iter()
            .map(|n| RtNote {
                pitch: n.pitch,
                velocity: n.velocity,
                start: n.start,
                duration: n.duration,
            })
            .collect(),
    };
    with_handle(&state, move |h| {
        h.send(RtCommand::ScheduleClip(rt_clip));
    })
}

#[tauri::command]
pub fn transport_current_beat(state: State<RealtimeState>) -> Result<f64, String> {
    let mut guard = state.handle.lock().map_err(|e| e.to_string())?;
    let h = guard.as_mut().ok_or("realtime engine not initialized")?;
    Ok(h.current_beat())
}
