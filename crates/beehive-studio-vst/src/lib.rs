use nih_plug::prelude::*;
use nih_plug::util::db_to_gain;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Beehive Studio VST Plugin — Generative MIDI output.
/// Communicates with the local agent orchestrator backend to receive
/// MIDI note data and outputs it as a MIDI/audio plugin in the DAW.
pub struct BeehiveStudioVst {
    params: Arc<BeehiveStudioParams>,
    sample_rate: f32,
    last_bpm: f32,
    is_generating: Arc<AtomicBool>,
    pending_notes: Arc<Mutex<Vec<(u8, u8, f64)>>>, // pitch, velocity, start_time_seconds
}

#[derive(Params)]
struct BeehiveStudioParams {
    /// BPM override — 0 means use host BPM
    #[id = "bpm"]
    pub bpm: FloatParam,

    /// Trigger generation flag
    #[id = "generate"]
    pub generate: BoolParam,

    /// Density of generated notes
    #[id = "density"]
    pub density: FloatParam,
}

impl Default for BeehiveStudioParams {
    fn default() -> Self {
        Self {
            bpm: FloatParam::new("BPM", 142.0, FloatRange::Linear { min: 60.0, max: 200.0 }),
            generate: BoolParam::new("Generate", false),
            density: FloatParam::new("Density", 0.65, FloatRange::Linear { min: 0.0, max: 1.0 }),
        }
    }
}

impl Default for BeehiveStudioVst {
    fn default() -> Self {
        Self {
            params: Arc::new(BeehiveStudioParams::default()),
            sample_rate: 44100.0,
            last_bpm: 142.0,
            is_generating: Arc::new(AtomicBool::new(false)),
            pending_notes: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl Plugin for BeehiveStudioVst {
    const NAME: &'static str = "Beehive Studio";
    const VENDOR: &'static str = "Beehive Studio";
    const URL: &'static str = "https://beehive.studio";
    const EMAIL: &'static str = "dev@beehive.studio";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");

    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[
        AudioIOLayout {
            main_input_channels: NonZeroU32::new(2),
            main_output_channels: NonZeroU32::new(2),
            aux_input_ports: &[],
            aux_output_ports: &[],
            names: PortNames::const_default(),
        },
    ];

    const MIDI_INPUT: MidiConfig = MidiConfig::Basic;
    const MIDI_OUTPUT: MidiConfig = MidiConfig::Basic;
    const SAMPLE_ACCURATE_AUTOMATION: bool = true;

    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone() as Arc<dyn Params>
    }

    fn initialize(
        &mut self,
        _audio_io_layout: &AudioIOLayout,
        _buffer_config: &BufferConfig,
        _context: &mut impl InitContext<Self>,
    ) -> bool {
        self.sample_rate = _buffer_config.sample_rate;
        true
    }

    fn reset(&mut self) {
        if let Ok(mut notes) = self.pending_notes.lock() {
            notes.clear();
        }
    }

    fn process(
        &mut self,
        buffer: &mut Buffer,
        _aux: &mut AuxiliaryBuffers,
        context: &mut impl ProcessContext<Self>,
    ) -> ProcessStatus {
        // Capture host BPM if available
        let transport = context.transport();
        if let Some(bpm) = transport.tempo {
            self.last_bpm = bpm as f32;
        }

        // Check if generation was triggered
        if self.params.generate.value() && !self.is_generating.load(Ordering::SeqCst) {
            self.is_generating.store(true, Ordering::SeqCst);
            self.trigger_generation();
        }

        // Output MIDI notes from the shared pending buffer
        let notes_to_send: Vec<(u8, u8, f64)> = {
            if let Ok(mut notes) = self.pending_notes.lock() {
                std::mem::take(&mut *notes)
            } else {
                Vec::new()
            }
        };

        for (pitch, velocity, _start_time) in &notes_to_send {
            context.send_event(NoteEvent::NoteOn {
                timing: 0,
                voice_id: None,
                channel: 0,
                note: *pitch,
                velocity: *velocity as f32 / 127.0,
            });
        }

        // Process audio (passthrough for now)
        for channel_samples in buffer.iter_samples() {
            for sample in channel_samples {
                *sample *= db_to_gain(0.0); // 0 dB gain
            }
        }

        ProcessStatus::Normal
    }

    fn task_executor(&mut self) -> TaskExecutor<Self> {
        Box::new(|_| {})
    }
}

impl BeehiveStudioVst {
    fn trigger_generation(&mut self) {
        let bpm = if self.params.bpm.value() > 0.0 {
            self.params.bpm.value()
        } else {
            self.last_bpm
        };
        let density = self.params.density.value();

        // Share the pending_notes Arc with the background thread
        let pending_notes = self.pending_notes.clone();
        let is_generating = self.is_generating.clone();
        std::thread::spawn(move || {
            match Self::call_backend(bpm, density) {
                Ok(notes) => {
                    nih_log!("Generated {} notes from backend", notes.len());
                    if let Ok(mut dest) = pending_notes.lock() {
                        dest.extend(notes);
                    }
                }
                Err(e) => {
                    nih_log!("Backend error: {}", e);
                }
            }
            is_generating.store(false, Ordering::SeqCst);
        });
    }

    fn call_backend(
        bpm: f32,
        density: f32,
    ) -> Result<Vec<(u8, u8, f64)>, String> {
        let client = reqwest::blocking::Client::new();
        let url = "http://127.0.0.1:9876/brief";

        let body = serde_json::json!({
            "brief": format!("Generative MIDI (BPM: {}, density: {})", bpm, density),
            "session_context": {},
        });

        let response = client
            .post(url)
            .json(&body)
            .send()
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Backend error: {}", response.status()));
        }

        let data: serde_json::Value = response
            .json()
            .map_err(|e| format!("Parse error: {}", e))?;

        let notes = data["clip_preview"]["notes"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        let parsed: Vec<(u8, u8, f64)> = notes
            .iter()
            .filter_map(|n| {
                Some((
                    n["pitch"].as_u64()? as u8,
                    n["velocity"].as_u64()? as u8,
                    n["start"].as_f64()?,
                ))
            })
            .collect();

        Ok(parsed)
    }
}

impl ClapPlugin for BeehiveStudioVst {
    const CLAP_ID: &'static str = "studio.beehive";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("Generative MIDI plugin for Beehive Studio");
    const CLAP_MANUAL_URL: Option<&'static str> = None;
    const CLAP_SUPPORT_URL: Option<&'static str> = None;
    const CLAP_FEATURES: &'static [ClapFeature] = &[
        ClapFeature::Instrument,
        ClapFeature::Synthesizer,
        ClapFeature::Stereo,
    ];
}

impl Vst3Plugin for BeehiveStudioVst {
    const VST3_CLASS_ID: [u8; 16] = [0xbe, 0xe1, 0x0c, 0xa1, 0x00, 0x00, 0x40, 0x00, 0x8c, 0x0a, 0x1e, 0x2f, 0x3d, 0x4e, 0x5a, 0x6b];
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] = &[
        Vst3SubCategory::Instrument,
        Vst3SubCategory::Synth,
    ];
}

nih_export_clap!(BeehiveStudioVst);
nih_export_vst3!(BeehiveStudioVst);
