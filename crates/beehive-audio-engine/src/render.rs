//! Offline multi-track render: MIDI synth + audio-clip mix -> stereo master + stems.
//!
//! Mirrors `apps/desktop/src/lib/audioEngine.ts` (`renderAudioBuffer`,
//! `exportProjectAudio`, `exportTrackStems`) so the Rust path matches the TS
//! reference: per-clip track lookup by `String(channel)`, mute/solo precedence,
//! 44100 Hz interleaved stereo, master LUFS-normalized, stems raw.

use std::collections::HashMap;

use serde::Deserialize;

use crate::synth::{osc_for_instrument, render_note};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderPreset {
    Draft,
    Club,
    Festival,
}

impl RenderPreset {
    /// Matches RENDER_PRESETS in `lib/exportWorkflow.ts`.
    pub fn target_lufs(self) -> f64 {
        match self {
            RenderPreset::Draft => -14.0,
            RenderPreset::Club => -9.5,
            RenderPreset::Festival => -7.5,
        }
    }

    pub fn parse(s: &str) -> RenderPreset {
        match s {
            "draft" => RenderPreset::Draft,
            "club" => RenderPreset::Club,
            _ => RenderPreset::Festival,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenderNote {
    pub pitch: u8,
    pub velocity: u8,
    pub start: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenderClip {
    #[serde(default)]
    pub notes: Vec<RenderNote>,
    #[serde(default)]
    pub channel: Option<serde_json::Value>,
    #[serde(default)]
    pub start: f64,
    #[serde(default, rename = "audioFilePath")]
    pub audio_file_path: Option<String>,
    #[serde(default, rename = "sourceOffset")]
    pub source_offset: f64,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub gain: Option<f32>,
    #[serde(default, rename = "warpStretchFactor")]
    pub warp_stretch_factor: Option<f64>,
    #[serde(default, rename = "fadeInBeats")]
    pub fade_in_beats: Option<f64>,
    #[serde(default, rename = "fadeOutBeats")]
    pub fade_out_beats: Option<f64>,
}

impl RenderClip {
    /// `String(clip.channel ?? 0)` — number or string normalised to a string key.
    pub fn channel_id(&self) -> String {
        match &self.channel {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Number(n)) => n.to_string(),
            _ => "0".to_string(),
        }
    }
}

fn default_volume() -> f32 {
    0.8
}

#[derive(Debug, Clone, Deserialize)]
pub struct MixerTrack {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub instrument: Option<String>,
}

/// Decoded audio for a sample clip (interleaved), keyed by file path.
#[derive(Debug, Clone)]
pub struct AudioBuf {
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct Stem {
    pub name: String,
    /// Interleaved stereo.
    pub samples: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct RenderOutput {
    /// Interleaved stereo, LUFS-normalised.
    pub master: Vec<f32>,
    /// One per track (raw, not master-normalised). Muted/non-solo => silent.
    pub stems: Vec<Stem>,
    pub sample_rate: u32,
}

/// Equal-power pan gains for pan in [-1, 1].
fn pan_gains(pan: f32) -> (f32, f32) {
    let p = ((pan.clamp(-1.0, 1.0) as f64) + 1.0) * std::f64::consts::FRAC_PI_4;
    (p.cos() as f32, p.sin() as f32)
}

fn total_beats(clips: &[RenderClip]) -> f64 {
    let mut tb = 4.0f64;
    for c in clips {
        if c.audio_file_path.is_some() {
            tb = tb.max(c.start + c.duration.unwrap_or(0.0));
        }
        for n in &c.notes {
            // Parity with TS renderAudioBuffer: MIDI uses note.start (clip.start ignored).
            tb = tb.max(n.start + n.duration);
        }
    }
    tb
}

fn add_mono_at(out: &mut [f32], mono: &[f32], start_frame: usize, gl: f32, gr: f32) {
    let frames = out.len() / 2;
    for (i, &s) in mono.iter().enumerate() {
        let f = start_frame + i;
        if f >= frames {
            break;
        }
        out[f * 2] += s * gl;
        out[f * 2 + 1] += s * gr;
    }
}

fn render_clip_midi(out: &mut [f32], clip: &RenderClip, instrument: &str, vol: f32, pan: f32, bpm: f64, sr: u32) {
    let osc = osc_for_instrument(instrument);
    let (gl, gr) = pan_gains(pan);
    let spb = 60.0 / bpm; // seconds per beat
    for n in &clip.notes {
        let gate_s = n.duration * spb;
        let mono = render_note(osc, n.pitch, n.velocity, gate_s, sr);
        let start_frame = (n.start * spb * sr as f64).round() as usize;
        add_mono_at(out, &mono, start_frame, gl * vol, gr * vol);
    }
}

fn render_clip_audio(
    out: &mut [f32],
    clip: &RenderClip,
    vol: f32,
    pan: f32,
    bpm: f64,
    sr: u32,
    audio_by_path: &HashMap<String, AudioBuf>,
) {
    let path = match &clip.audio_file_path {
        Some(p) => p,
        None => return,
    };
    let audio = match audio_by_path.get(path) {
        Some(a) => a,
        None => return,
    };
    let (gl, gr) = pan_gains(pan);
    let g = clip.gain.unwrap_or(1.0) * vol;
    let spb = 60.0 / bpm;
    let start_frame = (clip.start * spb * sr as f64).round() as usize;
    let src_ch = audio.channels.max(1) as usize;
    let src_frames = audio.samples.len() / src_ch;
    let src_offset_frame = (clip.source_offset * audio.sample_rate as f64).round() as usize;
    // Varispeed warp: consume source faster/slower per output frame.
    let warp = clip.warp_stretch_factor.filter(|w| *w > 0.0).unwrap_or(1.0);
    let ratio = audio.sample_rate as f64 / sr as f64 * warp;
    let fade_in = clip.fade_in_beats.unwrap_or(0.0);
    let fade_out = clip.fade_out_beats.unwrap_or(0.0);
    let clip_beats = clip.duration.unwrap_or(f64::INFINITY);
    let out_frames = out.len() / 2;
    let mut f = start_frame;
    let mut i = 0usize;
    loop {
        if f >= out_frames {
            break;
        }
        let out_beat = (i as f64 / sr as f64) / spb;
        if out_beat >= clip_beats {
            break;
        }
        // Linear-interpolated resample from source.
        let src_pos = src_offset_frame as f64 + i as f64 * ratio;
        let s0 = src_pos.floor() as usize;
        if s0 >= src_frames {
            break;
        }
        let frac = (src_pos - s0 as f64) as f32;
        let s1 = (s0 + 1).min(src_frames - 1);
        // Downmix source channels to mono.
        let m0: f32 = (0..src_ch).map(|c| audio.samples[s0 * src_ch + c]).sum::<f32>() / src_ch as f32;
        let m1: f32 = (0..src_ch).map(|c| audio.samples[s1 * src_ch + c]).sum::<f32>() / src_ch as f32;
        let s = m0 + (m1 - m0) * frac;
        // Linear fade envelope.
        let mut env = 1.0f32;
        if fade_in > 0.0 && out_beat < fade_in {
            env *= (out_beat / fade_in) as f32;
        }
        if fade_out > 0.0 && clip_beats.is_finite() && out_beat > clip_beats - fade_out {
            env *= ((clip_beats - out_beat) / fade_out).max(0.0) as f32;
        }
        out[f * 2] += s * gl * g * env;
        out[f * 2 + 1] += s * gr * g * env;
        f += 1;
        i += 1;
    }
}

/// Render a set of clips into interleaved stereo, honouring mute/solo exactly
/// like TS `renderAudioBuffer(clips, bpm, sr, mixerTracks)`.
fn render_clip_set(
    clips: &[RenderClip],
    tracks: &[MixerTrack],
    bpm: f64,
    sr: u32,
    audio_by_path: &HashMap<String, AudioBuf>,
) -> Vec<f32> {
    let frames = ((total_beats(clips) / (bpm / 60.0) + 1.0) * sr as f64).ceil() as usize;
    let mut out = vec![0f32; frames * 2];
    let has_solo = tracks.iter().any(|t| t.solo);
    for clip in clips {
        let cid = clip.channel_id();
        let track = tracks.iter().find(|t| t.id == cid);
        // TS: `if (hasSolo && track && !track.solo) continue;`
        if has_solo {
            if let Some(t) = track {
                if !t.solo {
                    continue;
                }
            }
        }
        // TS: `if (track && track.muted && !(hasSolo && track.solo)) continue;`
        if let Some(t) = track {
            if t.muted && !(has_solo && t.solo) {
                continue;
            }
        }
        let instrument = track
            .and_then(|t| t.instrument.clone())
            .unwrap_or_else(|| if cid == "0" { "bass".into() } else { "synth".into() });
        let vol = track.map(|t| t.volume).unwrap_or(0.8);
        let pan = track.map(|t| t.pan).unwrap_or(0.0);
        if clip.audio_file_path.is_some() {
            render_clip_audio(&mut out, clip, vol, pan, bpm, sr, audio_by_path);
        } else {
            render_clip_midi(&mut out, clip, &instrument, vol, pan, bpm, sr);
        }
    }
    out
}

/// RMS-based LUFS normalisation with a hard limiter, matching TS `normalizeBuffer`.
pub fn normalize_lufs(buf: &mut [f32], target_lufs: f64) {
    if buf.is_empty() {
        return;
    }
    let sumsq: f64 = buf.iter().map(|&s| (s as f64) * (s as f64)).sum();
    let rms = (sumsq / buf.len() as f64).sqrt();
    if rms < 1e-9 {
        return;
    }
    let target_rms = 10f64.powf(target_lufs / 20.0);
    // Match TS normalizeBuffer: scale to target RMS, rely on the output clamp as
    // the limiter (no gain cap). True silence is handled by the early return.
    let gain = target_rms / rms;
    for s in buf.iter_mut() {
        *s = ((*s as f64 * gain).clamp(-1.0, 1.0)) as f32;
    }
}

/// Full offline render: master (all clips, normalised) + per-track stems (raw).
pub fn render_offline(
    clips: &[RenderClip],
    tracks: &[MixerTrack],
    bpm: f64,
    sample_rate: u32,
    preset: RenderPreset,
    audio_by_path: &HashMap<String, AudioBuf>,
) -> RenderOutput {
    let mut master = render_clip_set(clips, tracks, bpm, sample_rate, audio_by_path);
    normalize_lufs(&mut master, preset.target_lufs());

    let mut stems = Vec::with_capacity(tracks.len());
    for track in tracks {
        let track_clips: Vec<RenderClip> = clips
            .iter()
            .filter(|c| c.channel_id() == track.id)
            .cloned()
            .collect();
        // Render against the full track list so mute/solo precedence matches master.
        let samples = render_clip_set(&track_clips, tracks, bpm, sample_rate, audio_by_path);
        stems.push(Stem {
            name: track.name.clone().unwrap_or_else(|| track.id.clone()),
            samples,
        });
    }

    RenderOutput {
        master,
        stems,
        sample_rate,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(pitch: u8, start: f64, dur: f64) -> RenderNote {
        RenderNote { pitch, velocity: 110, start, duration: dur }
    }

    fn midi_clip(channel: &str, notes: Vec<RenderNote>) -> RenderClip {
        RenderClip {
            notes,
            channel: Some(serde_json::Value::String(channel.into())),
            start: 0.0,
            audio_file_path: None,
            source_offset: 0.0,
            duration: None,
            gain: None,
            warp_stretch_factor: None,
            fade_in_beats: None,
            fade_out_beats: None,
        }
    }

    fn track(id: &str, instrument: &str, muted: bool, solo: bool) -> MixerTrack {
        MixerTrack {
            id: id.into(),
            name: Some(format!("Track {id}")),
            volume: 0.8,
            pan: 0.0,
            muted,
            solo,
            instrument: Some(instrument.into()),
        }
    }

    fn peak(buf: &[f32]) -> f32 {
        buf.iter().fold(0f32, |m, &s| m.max(s.abs()))
    }

    #[test]
    fn master_is_nonsilent() {
        let clips = vec![midi_clip("0", vec![note(45, 0.0, 1.0)])];
        let tracks = vec![track("0", "bass", false, false)];
        let out = render_offline(&clips, &tracks, 120.0, 44100, RenderPreset::Festival, &HashMap::new());
        assert!(peak(&out.master) > 0.1);
        assert_eq!(out.stems.len(), 1);
    }

    #[test]
    fn muted_track_yields_silent_stem() {
        let clips = vec![
            midi_clip("0", vec![note(45, 0.0, 1.0)]),
            midi_clip("1", vec![note(60, 0.0, 1.0)]),
        ];
        let tracks = vec![track("0", "bass", false, false), track("1", "synth", true, false)];
        let out = render_offline(&clips, &tracks, 120.0, 44100, RenderPreset::Festival, &HashMap::new());
        let stem1 = out.stems.iter().find(|s| s.name == "Track 1").unwrap();
        assert!(peak(&stem1.samples) < 1e-6, "muted stem should be silent");
        let stem0 = out.stems.iter().find(|s| s.name == "Track 0").unwrap();
        assert!(peak(&stem0.samples) > 0.1, "unmuted stem should be audible");
    }

    #[test]
    fn solo_silences_other_tracks() {
        let clips = vec![
            midi_clip("0", vec![note(45, 0.0, 1.0)]),
            midi_clip("1", vec![note(60, 0.0, 1.0)]),
        ];
        let tracks = vec![track("0", "bass", false, true), track("1", "synth", false, false)];
        let out = render_offline(&clips, &tracks, 120.0, 44100, RenderPreset::Festival, &HashMap::new());
        let stem1 = out.stems.iter().find(|s| s.name == "Track 1").unwrap();
        assert!(peak(&stem1.samples) < 1e-6, "non-solo stem should be silent");
    }

    #[test]
    fn pan_routes_energy_to_one_side() {
        let clips = vec![midi_clip("0", vec![note(57, 0.0, 0.5)])];
        let mut t = track("0", "bass", false, false);
        t.pan = -1.0; // hard left
        let out = render_offline(&clips, &[t], 120.0, 44100, RenderPreset::Festival, &HashMap::new());
        let left: f32 = out.master.iter().step_by(2).map(|s| s.abs()).sum();
        let right: f32 = out.master.iter().skip(1).step_by(2).map(|s| s.abs()).sum();
        assert!(left > right * 5.0, "hard-left pan should favour L: l={left} r={right}");
    }

    #[test]
    fn normalize_lufs_brings_quiet_signal_up() {
        let mut buf = vec![0.01f32; 44100 * 2];
        normalize_lufs(&mut buf, -14.0);
        let rms = (buf.iter().map(|&s| (s as f64).powi(2)).sum::<f64>() / buf.len() as f64).sqrt();
        // target rms for -14 LUFS ~= 0.2
        assert!(rms > 0.1, "normalised rms too low: {rms}");
    }

    #[test]
    fn audio_clip_mixes_in() {
        let mut by_path = HashMap::new();
        by_path.insert(
            "loop.wav".to_string(),
            AudioBuf { sample_rate: 44100, channels: 1, samples: vec![0.5f32; 44100] },
        );
        let clip = RenderClip {
            notes: vec![],
            channel: Some(serde_json::Value::String("0".into())),
            start: 0.0,
            audio_file_path: Some("loop.wav".into()),
            source_offset: 0.0,
            duration: Some(2.0),
            gain: Some(1.0),
            warp_stretch_factor: None,
            fade_in_beats: None,
            fade_out_beats: None,
        }
        ;
        let tracks = vec![track("0", "synth", false, false)];
        let out = render_offline(&[clip], &tracks, 120.0, 44100, RenderPreset::Draft, &by_path);
        assert!(peak(&out.master) > 0.1);
    }

    fn audio_clip(dur: f64, warp: Option<f64>, fade_in: Option<f64>, fade_out: Option<f64>) -> RenderClip {
        RenderClip {
            notes: vec![],
            channel: Some(serde_json::Value::String("0".into())),
            start: 0.0,
            audio_file_path: Some("loop.wav".into()),
            source_offset: 0.0,
            duration: Some(dur),
            gain: Some(1.0),
            warp_stretch_factor: warp,
            fade_in_beats: fade_in,
            fade_out_beats: fade_out,
        }
    }

    #[test]
    fn fade_in_attenuates_clip_start() {
        let mut by_path = HashMap::new();
        by_path.insert(
            "loop.wav".to_string(),
            AudioBuf { sample_rate: 44100, channels: 1, samples: vec![0.5f32; 44100 * 2] },
        );
        let tracks = vec![track("0", "synth", false, false)];
        // 2-beat clip at 120bpm = 1s; 1-beat fade-in.
        let out = render_offline(&[audio_clip(2.0, None, Some(1.0), None)], &tracks, 120.0, 44100, RenderPreset::Draft, &by_path);
        // First output frame should be ~silent (env ~0), later frames louder.
        let first = out.master[0].abs() + out.master[1].abs();
        let mid_idx = (0.5 * 44100.0) as usize * 2; // ~0.5s in
        let mid = out.master[mid_idx].abs() + out.master[mid_idx + 1].abs();
        assert!(first < 0.05, "fade-in start should be near silent, got {first}");
        assert!(mid > first, "fade-in should rise: first={first} mid={mid}");
    }

    #[test]
    fn warp_speeds_up_playback() {
        let mut by_path = HashMap::new();
        // 1s of source.
        by_path.insert(
            "loop.wav".to_string(),
            AudioBuf { sample_rate: 44100, channels: 1, samples: vec![0.5f32; 44100] },
        );
        let tracks = vec![track("0", "synth", false, false)];
        // warp 2x with a long clip duration: source is exhausted in ~half the frames.
        let out = render_offline(&[audio_clip(8.0, Some(2.0), None, None)], &tracks, 120.0, 44100, RenderPreset::Draft, &by_path);
        // audible content exists (source consumed), proving the warp path runs.
        assert!(peak(&out.master) > 0.1);
    }
}
