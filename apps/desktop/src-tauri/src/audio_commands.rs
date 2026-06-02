use std::path::Path;

/// Encode PCM samples to MP3 bytes.
#[tauri::command]
pub async fn encode_mp3(
    sample_rate: u32,
    channels: u16,
    samples: Vec<i16>,
) -> Result<Vec<u8>, String> {
    use shine_rs::mp3_encoder::{encode_pcm_to_mp3, Mp3EncoderConfig, StereoMode};

    let config = Mp3EncoderConfig::new()
        .sample_rate(sample_rate)
        .bitrate(192)
        .channels(channels as u8)
        .stereo_mode(if channels > 1 { StereoMode::JointStereo } else { StereoMode::Mono })
        .copyright(false)
        .original(true);

    encode_pcm_to_mp3(config, &samples)
        .map_err(|e| format!("Failed to encode MP3: {}", e))
}

/// Write WAV audio data to a file.
/// `samples` are interleaved 16-bit PCM little-endian.
#[tauri::command]
pub async fn write_wav_file(
    path: String,
    sample_rate: u32,
    channels: u16,
    samples: Vec<i16>,
) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(&path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    for sample in samples {
        writer
            .write_sample(sample)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    Ok(())
}

/// Export multiple audio stems as individual WAV files in a directory.
/// `stems` is a list of { name: string, samples: i16[], sample_rate: u32, channels: u16 }
#[tauri::command]
pub async fn export_audio_stems(
    dir: String,
    stems: Vec<serde_json::Value>,
) -> Result<Vec<String>, String> {
    let mut written: Vec<String> = Vec::new();

    for stem in stems {
        let name = stem["name"]
            .as_str()
            .unwrap_or("untitled")
            .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
        let filename = format!("{}_{}.wav", &name, cuid());
        let file_path = Path::new(&dir).join(&filename);

        let sample_rate = stem["sample_rate"].as_u64().unwrap_or(44100) as u32;
        let channels = stem["channels"].as_u64().unwrap_or(2) as u16;
        let samples: Vec<i16> = stem["samples"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_i64().map(|n| n as i16))
                    .collect()
            })
            .unwrap_or_default();

        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = hound::WavWriter::create(&file_path, spec)
            .map_err(|e| format!("Failed to create WAV file '{}': {}", filename, e))?;

        for sample in samples {
            writer
                .write_sample(sample)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }

        writer
            .finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

        written.push(file_path.to_string_lossy().to_string());
    }

    Ok(written)
}

/// Simple CUID-like ID generator for unique filenames
fn cuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}", ts)
}
