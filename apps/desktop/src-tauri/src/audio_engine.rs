use beehive_audio_engine::mixer::Mixer;
use std::sync::Mutex;
use tauri::State;

pub struct AudioEngineState {
    pub mixer: Mutex<Option<Mixer>>,
}

#[tauri::command]
pub fn audio_engine_init(state: State<AudioEngineState>) -> Result<String, String> {
    let mixer = Mixer::new().map_err(|e| e.to_string())?;
    let mut guard = state.mixer.lock().map_err(|e| e.to_string())?;
    *guard = Some(mixer);
    Ok("initialized".to_string())
}

#[tauri::command]
pub fn audio_engine_add_track(state: State<AudioEngineState>) -> Result<usize, String> {
    let guard = state.mixer.lock().map_err(|e| e.to_string())?;
    let mixer = guard.as_ref().ok_or("mixer not initialized")?;
    Ok(mixer.add_track())
}

#[tauri::command]
pub fn audio_engine_set_gain(state: State<AudioEngineState>, track: usize, gain: f32) -> Result<(), String> {
    let guard = state.mixer.lock().map_err(|e| e.to_string())?;
    let mixer = guard.as_ref().ok_or("mixer not initialized")?;
    mixer.set_track_gain(track, gain);
    Ok(())
}

#[tauri::command]
pub fn audio_engine_set_pan(state: State<AudioEngineState>, track: usize, pan: f32) -> Result<(), String> {
    let guard = state.mixer.lock().map_err(|e| e.to_string())?;
    let mixer = guard.as_ref().ok_or("mixer not initialized")?;
    mixer.set_track_pan(track, pan);
    Ok(())
}
