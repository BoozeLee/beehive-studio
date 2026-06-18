use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

pub struct Mixer {
    tracks: Arc<Mutex<Vec<Option<Track>>>>,
    sample_rate: f32,
    _stream: cpal::Stream,
}

struct Track {
    gain: f32,
    pan: f32,
    muted: bool,
    buffer: Vec<f32>,
    buffer_pos: usize,
}

impl Mixer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = host.default_output_device().ok_or("no output device")?;
        let config = device.default_output_config()?;
        let sample_rate = config.sample_rate().0 as f32;

        let tracks = Arc::new(Mutex::new(Vec::new()));
        let tracks_clone = tracks.clone();

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                Self::build_stream::<f32>(&device, &config.into(), tracks_clone)?
            }
            _ => return Err("unsupported sample format: only f32 is supported in v0.5.0-alpha".into()),
        };

        stream.play()?;

        Ok(Mixer {
            tracks,
            sample_rate,
            _stream: stream,
        })
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        tracks: Arc<Mutex<Vec<Option<Track>>>>,
    ) -> Result<cpal::Stream, Box<dyn std::error::Error>>
    where
        T: cpal::SizedSample + cpal::FromSample<f32>,
    {
        let channels = config.channels as usize;
        let stream = device.build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let mut tracks = tracks.lock().unwrap();
                for frame in data.chunks_mut(channels) {
                    let mut mix_l = 0.0f32;
                    let mut mix_r = 0.0f32;
                    for track in tracks.iter_mut().flatten() {
                        if track.muted || track.buffer_pos >= track.buffer.len() {
                            continue;
                        }
                        let sample = track.buffer[track.buffer_pos] * track.gain;
                        let pan_l = (1.0 - track.pan).clamp(0.0, 1.0);
                        let pan_r = (1.0 + track.pan).clamp(0.0, 1.0);
                        mix_l += sample * pan_l;
                        mix_r += sample * pan_r;
                        track.buffer_pos += 1;
                    }
                    if channels >= 2 {
                        frame[0] = T::from_sample(mix_l.clamp(-1.0, 1.0));
                        frame[1] = T::from_sample(mix_r.clamp(-1.0, 1.0));
                    } else {
                        frame[0] = T::from_sample(((mix_l + mix_r) * 0.5).clamp(-1.0, 1.0));
                    }
                }
            },
            |err| eprintln!("audio stream error: {}", err),
            None,
        )?;
        Ok(stream)
    }

    pub fn add_track(&self) -> usize {
        let mut tracks = self.tracks.lock().unwrap();
        let id = tracks.len();
        tracks.push(Some(Track {
            gain: 1.0,
            pan: 0.0,
            muted: false,
            buffer: Vec::new(),
            buffer_pos: 0,
        }));
        id
    }

    pub fn remove_track(&self, id: usize) {
        let mut tracks = self.tracks.lock().unwrap();
        if id < tracks.len() {
            tracks[id] = None;
        }
    }

    pub fn set_track_gain(&self, id: usize, gain: f32) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(Some(t)) = tracks.get_mut(id) {
            t.gain = gain;
        }
    }

    pub fn set_track_pan(&self, id: usize, pan: f32) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(Some(t)) = tracks.get_mut(id) {
            t.pan = pan.clamp(-1.0, 1.0);
        }
    }

    pub fn load_clip(&self, track_id: usize, samples: Vec<f32>) {
        let mut tracks = self.tracks.lock().unwrap();
        if let Some(Some(t)) = tracks.get_mut(track_id) {
            t.buffer = samples;
            t.buffer_pos = 0;
        }
    }
}
