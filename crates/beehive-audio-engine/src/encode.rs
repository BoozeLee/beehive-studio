//! Encode interleaved f32 stereo to WAV (16-bit PCM) and FLAC bytes.

use std::io::Cursor;

fn to_i16(s: f32) -> i16 {
    (s.clamp(-1.0, 1.0) * 32767.0) as i16
}

/// 16-bit PCM WAV bytes (hound).
pub fn encode_wav(interleaved: &[f32], sample_rate: u32, channels: u16) -> Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut w = hound::WavWriter::new(&mut cursor, spec).map_err(|e| e.to_string())?;
        for &s in interleaved {
            w.write_sample(to_i16(s)).map_err(|e| e.to_string())?;
        }
        w.finalize().map_err(|e| e.to_string())?;
    }
    Ok(cursor.into_inner())
}

/// 16-bit FLAC bytes (flacenc, pure Rust).
pub fn encode_flac(interleaved: &[f32], sample_rate: u32, channels: u16) -> Result<Vec<u8>, String> {
    use flacenc::component::BitRepr;
    use flacenc::error::Verify;

    let bits_per_sample = 16usize;
    let samples_i32: Vec<i32> = interleaved.iter().map(|&s| to_i16(s) as i32).collect();

    let config = flacenc::config::Encoder::default()
        .into_verified()
        .map_err(|e| format!("flac config: {e:?}"))?;
    let source = flacenc::source::MemSource::from_samples(
        &samples_i32,
        channels as usize,
        bits_per_sample,
        sample_rate as usize,
    );
    let stream = flacenc::encode_with_fixed_block_size(&config, source, config.block_size)
        .map_err(|e| format!("flac encode: {e:?}"))?;
    let mut sink = flacenc::bitsink::ByteSink::new();
    stream
        .write(&mut sink)
        .map_err(|e| format!("flac write: {e:?}"))?;
    Ok(sink.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_has_riff_header() {
        let samples = vec![0.2f32; 4410 * 2];
        let bytes = encode_wav(&samples, 44100, 2).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert!(bytes.len() > 44);
    }

    #[test]
    fn flac_has_marker() {
        let samples = vec![0.2f32; 4410 * 2];
        let bytes = encode_flac(&samples, 44100, 2).unwrap();
        assert_eq!(&bytes[0..4], b"fLaC");
    }
}
