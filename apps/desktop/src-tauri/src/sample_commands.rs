use std::fs::File;
use std::io::BufReader;
use std::path::Path;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SampleInfo {
    pub path: String,
    pub filename: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_secs: f64,
    pub bits_per_sample: u16,
}

#[derive(serde::Serialize)]
pub struct SampleData {
    pub info: SampleInfo,
    pub samples: Vec<f32>,
}

/// Get metadata for an audio file without loading the full sample data.
#[tauri::command]
pub async fn get_sample_info(path: String) -> Result<SampleInfo, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }

    let filename = p
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    match ext.as_str() {
        "wav" | "wave" => {
            let file = File::open(&path).map_err(|e| format!("Failed to open: {}", e))?;
            let reader = BufReader::new(file);
            let wav_reader = hound::WavReader::new(reader)
                .map_err(|e| format!("Failed to read WAV: {}", e))?;

            let spec = wav_reader.spec();
            let duration_secs = wav_reader.duration() as f64 / spec.sample_rate as f64;

            Ok(SampleInfo {
                path,
                filename,
                sample_rate: spec.sample_rate,
                channels: spec.channels,
                duration_secs,
                bits_per_sample: spec.bits_per_sample,
            })
        }
        "mp3" | "flac" | "ogg" | "aiff" | "aif" => {
            // For non-WAV formats, return basic info.
            // The frontend will use Tone.js Player for decoding.
            Ok(SampleInfo {
                path,
                filename,
                sample_rate: 44100,
                channels: 2,
                duration_secs: 0.0,
                bits_per_sample: 16,
            })
        }
        _ => Err(format!("Unsupported audio format: {}", ext)),
    }
}

/// Load a WAV audio sample and return decoded float data.
/// Non-WAV formats return empty samples — the frontend loads them via Tone.js.
#[tauri::command]
pub async fn load_sample(path: String) -> Result<SampleData, String> {
    let info = get_sample_info(path.clone()).await?;

    let ext = Path::new(&path)
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    let samples = if ext == "wav" || ext == "wave" {
        let file = File::open(&path).map_err(|e| format!("Failed to open: {}", e))?;
        let reader = BufReader::new(file);
        let wav_reader = hound::WavReader::new(reader)
            .map_err(|e| format!("Failed to read WAV: {}", e))?;

        let _spec = wav_reader.spec();
        wav_reader
            .into_samples::<i16>()
            .map(|s| s.unwrap_or(0) as f32 / i16::MAX as f32)
            .collect()
    } else {
        // Non-WAV: return empty — frontend uses Tone.js Player
        Vec::new()
    };

    Ok(SampleData { info, samples })
}