//! Lock-free realtime playback engine.
//!
//! The audio callback drains a single-producer/single-consumer command queue
//! (no locks), advances a sample-accurate transport, triggers MIDI voices at
//! their scheduled sample, and mixes them — no allocation on the steady-state
//! per-sample path. The UI thread pushes commands and reads `current_beat`
//! (an atomic) without ever blocking the audio thread.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};

use crate::synth::{midi_to_freq, Osc};

#[derive(Debug, Clone)]
pub struct RtNote {
    pub pitch: u8,
    pub velocity: u8,
    /// Beats from clip start.
    pub start: f64,
    /// Beats.
    pub duration: f64,
}

#[derive(Debug, Clone)]
pub struct RtClip {
    pub channel: u32,
    /// Clip position in the arrangement, beats.
    pub start_beat: f64,
    pub osc: Osc,
    pub gain: f32,
    pub pan: f32,
    pub notes: Vec<RtNote>,
}

#[derive(Debug)]
pub enum RtCommand {
    SetBpm(f64),
    Play,
    Pause,
    Stop,
    Seek(f64),
    ScheduleClip(RtClip),
    ClearClips,
}

// ADSR release tail (seconds), mirrors synth.rs.
const RELEASE: f64 = 0.35;
const ATTACK: f64 = 0.003;
const DECAY: f64 = 0.08;
const SUSTAIN: f64 = 0.4;

struct ScheduledNote {
    trigger_sample: u64,
    osc: Osc,
    freq: f64,
    amp: f32, // velocity * clip gain
    gate_s: f64,
    pan: f32,
}

struct Voice {
    osc: Osc,
    phase: f64,
    phase_inc: f64,
    amp: f32,
    gate_s: f64,
    pan: f32,
    t: f64, // seconds since trigger
}

impl Voice {
    fn env(&self) -> f64 {
        let t = self.t;
        let gate = self.gate_s;
        if t < gate {
            if t < ATTACK {
                t / ATTACK
            } else if t < ATTACK + DECAY {
                1.0 - ((t - ATTACK) / DECAY) * (1.0 - SUSTAIN)
            } else {
                SUSTAIN
            }
        } else {
            let rt = t - gate;
            if rt >= RELEASE {
                0.0
            } else {
                let gate_level = if gate < ATTACK {
                    gate / ATTACK
                } else if gate < ATTACK + DECAY {
                    1.0 - ((gate - ATTACK) / DECAY) * (1.0 - SUSTAIN)
                } else {
                    SUSTAIN
                };
                gate_level * (1.0 - rt / RELEASE)
            }
        }
    }

    fn finished(&self) -> bool {
        self.t >= self.gate_s + RELEASE
    }

    fn next(&mut self, sr: f64) -> (f32, f32) {
        let s = crate::synth::osc_sample(self.osc, self.phase) * self.env() * self.amp as f64;
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        self.t += 1.0 / sr;
        let (gl, gr) = pan_gains(self.pan);
        ((s as f32) * gl, (s as f32) * gr)
    }
}

fn pan_gains(pan: f32) -> (f32, f32) {
    let p = ((pan.clamp(-1.0, 1.0) as f64) + 1.0) * std::f64::consts::FRAC_PI_4;
    (p.cos() as f32, p.sin() as f32)
}

pub struct RealtimeEngine {
    rx: HeapCons<RtCommand>,
    sample_rate: f64,
    bpm: f64,
    playing: bool,
    sample_pos: u64,
    clips: Vec<RtClip>,
    schedule: Vec<ScheduledNote>,
    cursor: usize,
    voices: Vec<Voice>,
    current_beat: Arc<AtomicU64>,
    playing_flag: Arc<AtomicBool>,
}

/// UI-side handle: push commands, read transport state. Never blocks the audio thread.
pub struct RtHandle {
    tx: HeapProd<RtCommand>,
    current_beat: Arc<AtomicU64>,
    playing_flag: Arc<AtomicBool>,
}

impl RtHandle {
    pub fn send(&mut self, cmd: RtCommand) -> bool {
        self.tx.try_push(cmd).is_ok()
    }
    pub fn current_beat(&self) -> f64 {
        f64::from_bits(self.current_beat.load(Ordering::Relaxed))
    }
    pub fn is_playing(&self) -> bool {
        self.playing_flag.load(Ordering::Relaxed)
    }
}

pub fn new_engine(sample_rate: f64, capacity: usize) -> (RealtimeEngine, RtHandle) {
    let rb = HeapRb::<RtCommand>::new(capacity);
    let (tx, rx) = rb.split();
    let current_beat = Arc::new(AtomicU64::new(0));
    let playing_flag = Arc::new(AtomicBool::new(false));
    let engine = RealtimeEngine {
        rx,
        sample_rate,
        bpm: 142.0,
        playing: false,
        sample_pos: 0,
        clips: Vec::with_capacity(256),
        schedule: Vec::with_capacity(4096),
        cursor: 0,
        voices: Vec::with_capacity(256),
        current_beat: current_beat.clone(),
        playing_flag: playing_flag.clone(),
    };
    let handle = RtHandle {
        tx,
        current_beat,
        playing_flag,
    };
    (engine, handle)
}

impl RealtimeEngine {
    fn samples_per_beat(&self) -> f64 {
        self.sample_rate * 60.0 / self.bpm
    }

    fn rebuild_schedule(&mut self) {
        self.schedule.clear();
        let spb = self.samples_per_beat();
        for clip in &self.clips {
            for n in &clip.notes {
                let trig_beat = clip.start_beat + n.start;
                let amp = (n.velocity as f32 / 127.0).max(0.1) * clip.gain;
                self.schedule.push(ScheduledNote {
                    trigger_sample: (trig_beat * spb).round() as u64,
                    osc: clip.osc,
                    freq: midi_to_freq(n.pitch),
                    amp,
                    gate_s: n.duration * 60.0 / self.bpm,
                    pan: clip.pan,
                });
            }
        }
        self.schedule.sort_by_key(|s| s.trigger_sample);
        self.advance_cursor();
    }

    fn advance_cursor(&mut self) {
        self.cursor = self
            .schedule
            .partition_point(|s| s.trigger_sample < self.sample_pos);
    }

    fn apply(&mut self, cmd: RtCommand) {
        match cmd {
            RtCommand::SetBpm(b) => {
                if b > 0.0 {
                    self.bpm = b;
                    self.rebuild_schedule();
                }
            }
            RtCommand::Play => {
                self.playing = true;
            }
            RtCommand::Pause => {
                self.playing = false;
            }
            RtCommand::Stop => {
                self.playing = false;
                self.sample_pos = 0;
                self.voices.clear();
                self.advance_cursor();
            }
            RtCommand::Seek(beat) => {
                let beat = beat.max(0.0);
                self.sample_pos = (beat * self.samples_per_beat()).round() as u64;
                self.voices.clear();
                self.advance_cursor();
            }
            RtCommand::ScheduleClip(clip) => {
                self.clips.push(clip);
                self.rebuild_schedule();
            }
            RtCommand::ClearClips => {
                self.clips.clear();
                self.schedule.clear();
                self.cursor = 0;
                self.voices.clear();
            }
        }
    }

    fn publish_beat(&self) {
        let beat = self.sample_pos as f64 / self.samples_per_beat();
        self.current_beat
            .store(beat.to_bits(), Ordering::Relaxed);
        self.playing_flag.store(self.playing, Ordering::Relaxed);
    }

    /// Render one block of interleaved stereo. Drains commands first (lock-free).
    pub fn process(&mut self, out: &mut [f32]) {
        while let Some(cmd) = self.rx.try_pop() {
            self.apply(cmd);
        }
        let frames = out.len() / 2;
        if !self.playing {
            for s in out.iter_mut() {
                *s = 0.0;
            }
            self.publish_beat();
            return;
        }
        let sr = self.sample_rate;
        for f in 0..frames {
            while self.cursor < self.schedule.len()
                && self.schedule[self.cursor].trigger_sample <= self.sample_pos
            {
                let ev = &self.schedule[self.cursor];
                self.voices.push(Voice {
                    osc: ev.osc,
                    phase: 0.0,
                    phase_inc: ev.freq / sr,
                    amp: ev.amp,
                    gate_s: ev.gate_s,
                    pan: ev.pan,
                    t: 0.0,
                });
                self.cursor += 1;
            }
            let mut l = 0f32;
            let mut r = 0f32;
            for v in self.voices.iter_mut() {
                let (vl, vr) = v.next(sr);
                l += vl;
                r += vr;
            }
            self.voices.retain(|v| !v.finished());
            out[f * 2] = l.clamp(-1.0, 1.0);
            out[f * 2 + 1] = r.clamp(-1.0, 1.0);
            self.sample_pos += 1;
        }
        self.publish_beat();
    }
}

/// Build and start a CPAL output stream driven by a fresh [`RealtimeEngine`].
/// Returns the live stream (keep it alive) and a [`RtHandle`] for control.
/// Not exercised by unit tests (no audio device); the engine itself is tested
/// via [`RealtimeEngine::process`].
pub fn start_output(capacity: usize) -> Result<(cpal::Stream, RtHandle), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or("no output device")?;
    let config = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = config.sample_rate().0 as f64;
    let channels = config.channels() as usize;
    let (mut engine, handle) = new_engine(sample_rate, capacity);

    let err_fn = |e| eprintln!("realtime stream error: {e}");
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            // Reused scratch buffer for non-stereo device layouts (no steady-state alloc).
            let mut scratch: Vec<f32> = Vec::new();
            device
                .build_output_stream(
                    &config.into(),
                    move |data: &mut [f32], _| {
                        if channels == 2 {
                            engine.process(data);
                        } else {
                            let frames = data.len() / channels.max(1);
                            if scratch.len() != frames * 2 {
                                scratch.resize(frames * 2, 0.0);
                            }
                            engine.process(&mut scratch);
                            for f in 0..frames {
                                let l = scratch[f * 2];
                                let r = scratch[f * 2 + 1];
                                for c in 0..channels {
                                    data[f * channels + c] = match c {
                                        0 => l,
                                        1 => r,
                                        _ => 0.0,
                                    };
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| e.to_string())?
        }
        _ => return Err("only f32 output is supported".into()),
    };
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, handle))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drain_blocks(engine: &mut RealtimeEngine, blocks: usize, block_frames: usize) -> Vec<f32> {
        let mut all = Vec::new();
        let mut buf = vec![0f32; block_frames * 2];
        for _ in 0..blocks {
            for s in buf.iter_mut() {
                *s = 0.0;
            }
            engine.process(&mut buf);
            all.extend_from_slice(&buf);
        }
        all
    }

    fn peak(b: &[f32]) -> f32 {
        b.iter().fold(0f32, |m, &s| m.max(s.abs()))
    }

    #[test]
    fn silent_until_play() {
        let (mut e, mut h) = new_engine(44100.0, 64);
        h.send(RtCommand::ScheduleClip(RtClip {
            channel: 0,
            start_beat: 0.0,
            osc: Osc::Sawtooth,
            gain: 1.0,
            pan: 0.0,
            notes: vec![RtNote { pitch: 57, velocity: 110, start: 0.0, duration: 1.0 }],
        }));
        let out = drain_blocks(&mut e, 4, 512);
        assert!(peak(&out) < 1e-6, "should be silent before Play");
        assert!(!h.is_playing());
    }

    #[test]
    fn plays_scheduled_note() {
        let (mut e, mut h) = new_engine(44100.0, 64);
        h.send(RtCommand::SetBpm(120.0));
        h.send(RtCommand::ScheduleClip(RtClip {
            channel: 0,
            start_beat: 0.0,
            osc: Osc::Sawtooth,
            gain: 1.0,
            pan: 0.0,
            notes: vec![RtNote { pitch: 57, velocity: 120, start: 0.0, duration: 0.5 }],
        }));
        h.send(RtCommand::Play);
        let out = drain_blocks(&mut e, 20, 512); // ~0.23s
        assert!(peak(&out) > 0.1, "scheduled note should sound");
        assert!(h.is_playing());
        assert!(h.current_beat() > 0.0);
    }

    #[test]
    fn transport_advances_beat_accurately() {
        let (mut e, mut h) = new_engine(48000.0, 64);
        h.send(RtCommand::SetBpm(120.0)); // 2 beats/sec -> 1 beat in 24000 samples
        h.send(RtCommand::Play);
        // process exactly 24000 samples
        drain_blocks(&mut e, 24000 / 480, 480);
        let beat = h.current_beat();
        assert!((beat - 1.0).abs() < 0.01, "expected ~1.0 beat, got {beat}");
    }

    #[test]
    fn stop_resets_and_silences() {
        let (mut e, mut h) = new_engine(44100.0, 64);
        h.send(RtCommand::ScheduleClip(RtClip {
            channel: 0,
            start_beat: 0.0,
            osc: Osc::Square,
            gain: 1.0,
            pan: 0.0,
            notes: vec![RtNote { pitch: 69, velocity: 120, start: 0.0, duration: 4.0 }],
        }));
        h.send(RtCommand::Play);
        drain_blocks(&mut e, 4, 512);
        h.send(RtCommand::Stop);
        let out = drain_blocks(&mut e, 4, 512);
        assert!(peak(&out) < 1e-6, "stop should silence + reset");
        assert!((h.current_beat()).abs() < 1e-9);
    }

    #[test]
    fn seek_moves_playhead() {
        let (mut e, mut h) = new_engine(44100.0, 64);
        h.send(RtCommand::SetBpm(120.0));
        h.send(RtCommand::Seek(4.0));
        h.send(RtCommand::Play);
        drain_blocks(&mut e, 1, 64);
        assert!(h.current_beat() >= 4.0);
    }

    #[test]
    fn pan_routes_energy() {
        let (mut e, mut h) = new_engine(44100.0, 64);
        h.send(RtCommand::ScheduleClip(RtClip {
            channel: 0,
            start_beat: 0.0,
            osc: Osc::Sawtooth,
            gain: 1.0,
            pan: -1.0,
            notes: vec![RtNote { pitch: 57, velocity: 120, start: 0.0, duration: 0.5 }],
        }));
        h.send(RtCommand::Play);
        let out = drain_blocks(&mut e, 16, 512);
        let left: f32 = out.iter().step_by(2).map(|s| s.abs()).sum();
        let right: f32 = out.iter().skip(1).step_by(2).map(|s| s.abs()).sum();
        assert!(left > right * 5.0, "hard-left pan: l={left} r={right}");
    }
}
