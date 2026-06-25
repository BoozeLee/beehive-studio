use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

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

pub(crate) fn decode_audio(path: &str) -> Result<(u32, u16, Vec<f32>), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open: {}", e))?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(path).extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Failed to probe audio: {}", e))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "Audio file has no default track".to_string())?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;
    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(44_100);
    let mut channels = track.codec_params.channels.map(|value| value.count() as u16).unwrap_or(2);
    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(error) => return Err(format!("Failed to read audio packet: {}", error)),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|e| format!("Failed to decode audio packet: {}", e))?;
        sample_rate = decoded.spec().rate;
        channels = decoded.spec().channels.count() as u16;
        let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        buffer.copy_interleaved_ref(decoded);
        samples.extend_from_slice(buffer.samples());
    }
    Ok((sample_rate, channels, samples))
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
        "wav" | "wave" | "mp3" | "flac" | "ogg" | "aiff" | "aif" => {
            let (sample_rate, channels, samples) = decode_audio(&path)?;
            let duration_secs = samples.len() as f64 / sample_rate as f64 / channels as f64;
            Ok(SampleInfo {
                path,
                filename,
                sample_rate,
                channels,
                duration_secs,
                bits_per_sample: 32,
            })
        }
        _ => Err(format!("Unsupported audio format: {}", ext)),
    }
}

/// Load a supported audio sample and return decoded interleaved float data.
#[tauri::command]
pub async fn load_sample(path: String) -> Result<SampleData, String> {
    let info = get_sample_info(path.clone()).await?;

    let (_, _, samples) = decode_audio(&path)?;

    Ok(SampleData { info, samples })
}
