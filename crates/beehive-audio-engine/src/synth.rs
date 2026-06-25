//! Monophonic synth voice rendering.
//!
//! Reproduces the TS Tone.js voices used by `lib/audioEngine.ts` so the Rust
//! offline render matches the existing reference within tolerance:
//! instrument -> oscillator (drum=sine, pad=triangle, bass=sawtooth, synth=square),
//! ADSR 0.003/0.08/0.4/0.35, velocity gain `max(0.1, v/127)`,
//! midi->freq `440 * 2^((n-69)/12)`.

use std::f64::consts::PI;

/// Oscillator waveform, selected per instrument.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Osc {
    Sine,
    Triangle,
    Sawtooth,
    Square,
}

pub fn osc_for_instrument(instrument: &str) -> Osc {
    match instrument {
        "drum" => Osc::Sine,
        "pad" => Osc::Triangle,
        "bass" => Osc::Sawtooth,
        // "synth" and anything else fall back to square (matches the TS default).
        _ => Osc::Square,
    }
}

pub fn midi_to_freq(pitch: u8) -> f64 {
    440.0 * 2f64.powf((pitch as f64 - 69.0) / 12.0)
}

// ADSR envelope (seconds / level), matching the TS Tone.Synth envelope.
const ATTACK: f64 = 0.003;
const DECAY: f64 = 0.08;
const SUSTAIN: f64 = 0.4;
const RELEASE: f64 = 0.35;

pub fn osc_sample(osc: Osc, phase: f64) -> f64 {
    // `phase` is in [0, 1).
    match osc {
        Osc::Sine => (2.0 * PI * phase).sin(),
        // Triangle in [-1, 1].
        Osc::Triangle => 4.0 * (phase - (phase + 0.5).floor()).abs() - 1.0,
        // Naive sawtooth in [-1, 1].
        Osc::Sawtooth => 2.0 * (phase - (phase + 0.5).floor()),
        Osc::Square => {
            if phase < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
    }
}

/// Envelope level at `t` seconds after note-on, for a gate of `gate` seconds.
/// Attack/Decay/Sustain during the gate, linear Release afterwards.
fn envelope(t: f64, gate: f64) -> f64 {
    if t < 0.0 {
        return 0.0;
    }
    if t < gate {
        if t < ATTACK {
            t / ATTACK
        } else if t < ATTACK + DECAY {
            let d = (t - ATTACK) / DECAY;
            1.0 - d * (1.0 - SUSTAIN)
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

/// Total seconds a note occupies (gate + release tail).
pub fn note_total_seconds(gate_s: f64) -> f64 {
    gate_s + RELEASE
}

/// Render one note to a mono buffer at `sample_rate`. Length covers gate + release.
pub fn render_note(osc: Osc, pitch: u8, velocity: u8, gate_s: f64, sample_rate: u32) -> Vec<f32> {
    let sr = sample_rate as f64;
    let freq = midi_to_freq(pitch);
    let vel_gain = (velocity as f64 / 127.0).max(0.1);
    let n = (note_total_seconds(gate_s) * sr).ceil() as usize;
    let mut out = vec![0f32; n];
    let phase_inc = freq / sr;
    let mut phase = 0.0f64;
    for (i, s) in out.iter_mut().enumerate() {
        let t = i as f64 / sr;
        let env = envelope(t, gate_s);
        *s = (osc_sample(osc, phase) * env * vel_gain) as f32;
        phase += phase_inc;
        if phase >= 1.0 {
            phase -= 1.0;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a4_is_440() {
        assert!((midi_to_freq(69) - 440.0).abs() < 1e-9);
    }

    #[test]
    fn instrument_oscillators_match_ts() {
        assert_eq!(osc_for_instrument("drum"), Osc::Sine);
        assert_eq!(osc_for_instrument("pad"), Osc::Triangle);
        assert_eq!(osc_for_instrument("bass"), Osc::Sawtooth);
        assert_eq!(osc_for_instrument("synth"), Osc::Square);
        assert_eq!(osc_for_instrument("anything"), Osc::Square);
    }

    #[test]
    fn note_renders_nonsilent_with_release_tail() {
        let buf = render_note(Osc::Sawtooth, 57, 110, 0.25, 44100);
        // gate 0.25s + 0.35s release ~= 0.6s
        assert!(buf.len() >= (0.6 * 44100.0) as usize - 2);
        let peak = buf.iter().fold(0f32, |m, &s| m.max(s.abs()));
        assert!(peak > 0.1, "expected audible peak, got {peak}");
    }

    #[test]
    fn low_velocity_floored_at_0_1() {
        // velocity 1 -> gain max(0.1, 1/127) == 0.1, not ~0.008
        let buf = render_note(Osc::Square, 69, 1, 0.2, 44100);
        let peak = buf.iter().fold(0f32, |m, &s| m.max(s.abs()));
        assert!((0.09..=0.11).contains(&peak), "velocity floor wrong: {peak}");
    }

    #[test]
    fn velocity_scales_amplitude() {
        let soft = render_note(Osc::Square, 69, 40, 0.2, 44100);
        let loud = render_note(Osc::Square, 69, 120, 0.2, 44100);
        let p = |b: &[f32]| b.iter().fold(0f32, |m, &s| m.max(s.abs()));
        assert!(p(&loud) > p(&soft) * 1.5);
    }
}
