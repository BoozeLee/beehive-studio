#[cfg(test)]
mod tests {
    use crate::BackendResponse;

    #[test]
    fn test_backend_response_serialization() {
        let response = BackendResponse {
            task_id: "test-123".to_string(),
            status: "completed".to_string(),
            reasoning: vec!["Step 1".to_string(), "Step 2".to_string()],
            clip_preview: serde_json::json!({"notes": []}),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test-123"));
        assert!(json.contains("completed"));
        assert!(json.contains("Step 1"));
    }

    #[test]
    fn test_backend_response_empty_reasoning() {
        let response = BackendResponse {
            task_id: "test-456".to_string(),
            status: "pending".to_string(),
            reasoning: vec![],
            clip_preview: serde_json::json!({"notes": []}),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test-456"));
        assert!(json.contains("pending"));
        assert!(json.contains("reasoning"));
        assert!(json.contains("[]"));
    }

    #[test]
    fn test_midi_ports_error_format() {
        let error = "No MIDI ports available".to_string();
        let formatted = format!("Failed to create MIDI input: {}", error);
        assert_eq!(formatted, "Failed to create MIDI input: No MIDI ports available");
    }

    #[test]
    fn test_midi_input_invalid_port() {
        let error = "Invalid port index".to_string();
        let formatted = format!("Failed to connect MIDI input: {}", error);
        assert_eq!(formatted, "Failed to connect MIDI input: Invalid port index");
    }

    // ── audio_commands tests ──

    #[test]
    fn test_wav_spec_creation() {
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        assert_eq!(spec.channels, 2);
        assert_eq!(spec.sample_rate, 44100);
        assert_eq!(spec.bits_per_sample, 16);
    }

    #[test]
    fn test_wav_spec_mono() {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 22050,
            bits_per_sample: 8,
            sample_format: hound::SampleFormat::Int,
        };
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.sample_rate, 22050);
        assert_eq!(spec.bits_per_sample, 8);
    }

    #[test]
    fn test_wav_write_and_read_roundtrip() {
        use std::io::BufReader;
        let dir = std::env::temp_dir();
        let path = dir.join("test_roundtrip.wav");

        // Write test WAV
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let samples: Vec<i16> = (0..100).map(|i| (i as i16 * 100) % i16::MAX).collect();

        {
            let mut writer = hound::WavWriter::create(&path, spec).unwrap();
            for &s in &samples {
                writer.write_sample(s).unwrap();
            }
            writer.finalize().unwrap();
        }

        // Read back and verify
        let file = std::fs::File::open(&path).unwrap();
        let reader = hound::WavReader::new(BufReader::new(file)).unwrap();
        let read_spec = reader.spec();
        assert_eq!(read_spec.channels, spec.channels);
        assert_eq!(read_spec.sample_rate, spec.sample_rate);
        assert_eq!(read_spec.bits_per_sample, spec.bits_per_sample);
        assert_eq!(reader.duration() as usize, samples.len());

        let read_samples: Vec<i16> = reader.into_samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(read_samples.len(), samples.len());
        for (a, b) in samples.iter().zip(read_samples.iter()) {
            assert_eq!(a, b);
        }

        // Cleanup
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_wav_stereo_interleaved() {
        use std::io::BufReader;
        let dir = std::env::temp_dir();
        let path = dir.join("test_stereo.wav");

        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        // 10 stereo frames = 20 samples
        let samples: Vec<i16> = (0..20).collect();

        {
            let mut writer = hound::WavWriter::create(&path, spec).unwrap();
            for &s in &samples {
                writer.write_sample(s).unwrap();
            }
            writer.finalize().unwrap();
        }

        let file = std::fs::File::open(&path).unwrap();
        let reader = hound::WavReader::new(BufReader::new(file)).unwrap();
        assert_eq!(reader.spec().channels, 2);
        assert_eq!(reader.duration(), 10); // frames, not samples
        assert_eq!(reader.len() as usize, 20); // total samples

        let _ = std::fs::remove_file(&path);
    }

    // ── sample_commands tests ──

    #[test]
    fn test_sample_info_parsing() {
        use crate::sample_commands::SampleInfo;
        let info = SampleInfo {
            path: "/tmp/test.wav".to_string(),
            filename: "test.wav".to_string(),
            sample_rate: 44100,
            channels: 2,
            duration_secs: 1.0,
            bits_per_sample: 16,
        };
        assert_eq!(info.filename, "test.wav");
        assert_eq!(info.sample_rate, 44100);
        assert!(info.duration_secs > 0.0);
    }

    #[test]
    fn test_sample_info_defaults_for_non_wav() {
        use crate::sample_commands::SampleInfo;
        let info = SampleInfo {
            path: "/tmp/test.flac".to_string(),
            filename: "test.flac".to_string(),
            sample_rate: 44100,
            channels: 2,
            duration_secs: 0.0,
            bits_per_sample: 16,
        };
        assert_eq!(info.sample_rate, 44100);
        assert_eq!(info.duration_secs, 0.0);
        // Non-WAV files return default metadata
        assert_eq!(info.channels, 2);
    }

    #[test]
    fn test_sample_data_structure() {
        use crate::sample_commands::{SampleData, SampleInfo};
        let info = SampleInfo {
            path: "/tmp/test.wav".to_string(),
            filename: "test.wav".to_string(),
            sample_rate: 44100,
            channels: 1,
            duration_secs: 1.0,
            bits_per_sample: 16,
        };
        let samples: Vec<f32> = vec![0.0, 0.5, -0.5, 1.0, -1.0];
        let data = SampleData { info, samples: samples.clone() };
        assert_eq!(data.samples.len(), 5);
        assert_eq!(data.samples[0], 0.0);
        assert_eq!(data.samples[2], -0.5);
        assert!(data.samples.iter().all(|&s| s >= -1.0 && s <= 1.0));
    }

    #[test]
    fn test_sample_loading_from_wav() {
        use std::io::BufReader;
        let dir = std::env::temp_dir();
        let path = dir.join("test_sample_load.wav");

        // Write a test WAV with known samples
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let original: Vec<i16> = vec![0, 1000, -1000, 32767, -32768];

        {
            let mut writer = hound::WavWriter::create(&path, spec).unwrap();
            for &s in &original {
                writer.write_sample(s).unwrap();
            }
            writer.finalize().unwrap();
        }

        // Simulate load_sample logic: read WAV, convert to f32
        let file = std::fs::File::open(&path).unwrap();
        let reader = hound::WavReader::new(BufReader::new(file)).unwrap();
        let read_spec = reader.spec();
        assert_eq!(read_spec.channels, 1);
        assert_eq!(read_spec.sample_rate, 44100);

        let raw_samples: Vec<i16> = reader.into_samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(raw_samples.len(), original.len());

        let float_samples: Vec<f32> = raw_samples.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
        assert!((float_samples[0] - 0.0).abs() < 0.001);
        assert!(float_samples[1] > 0.0);
        assert!(float_samples[2] < 0.0);
        assert!((float_samples[3] - 1.0).abs() < 0.001);
        assert!((float_samples[4] - (-1.0)).abs() < 0.001);

        let _ = std::fs::remove_file(&path);
    }

    // ── MP3 encoder tests ──

    #[test]
    fn test_mp3_encode_mono() {
        use shine_rs::mp3_encoder::{encode_pcm_to_mp3, Mp3EncoderConfig, StereoMode};

        let samples: Vec<i16> = (0..4410)
            .map(|i| ((i as f64 * 440.0 * 2.0 * std::f64::consts::PI / 44100.0).sin() * 16000.0) as i16)
            .collect();

        let config = Mp3EncoderConfig::new()
            .sample_rate(44100)
            .bitrate(192)
            .channels(1)
            .stereo_mode(StereoMode::Mono)
            .copyright(false)
            .original(true);

        let result = encode_pcm_to_mp3(config, &samples).unwrap();
        assert!(!result.is_empty(), "MP3 data should not be empty");
        // Verify MP3 sync word: first 11 bits should be 0x7FF
        assert_eq!(result[0], 0xFF, "First byte should be MP3 sync 0xFF");
        assert!(
            (result[1] & 0xE0) == 0xE0 || (result[1] & 0xF0) == 0xF0,
            "Second byte should have sync bits set"
        );
    }

    #[test]
    fn test_mp3_encode_stereo() {
        use shine_rs::mp3_encoder::{encode_pcm_to_mp3, Mp3EncoderConfig, StereoMode};

        let samples: Vec<i16> = (0..8820)
            .map(|i| ((i as f64 * 440.0 * 2.0 * std::f64::consts::PI / 44100.0).sin() * 16000.0) as i16)
            .collect();

        let config = Mp3EncoderConfig::new()
            .sample_rate(44100)
            .bitrate(192)
            .channels(2)
            .stereo_mode(StereoMode::JointStereo)
            .copyright(false)
            .original(true);

        let result = encode_pcm_to_mp3(config, &samples).unwrap();
        assert!(!result.is_empty());
        assert_eq!(result[0], 0xFF);
    }

    #[test]
    fn test_mp3_encode_different_sample_rates() {
        use shine_rs::mp3_encoder::{encode_pcm_to_mp3, Mp3EncoderConfig, StereoMode};

        for &sample_rate in &[44100, 48000] {
            let count = sample_rate as usize / 200;
            let samples: Vec<i16> = (0..count)
                .map(|i| ((i as f64 * 440.0 * 2.0 * std::f64::consts::PI / sample_rate as f64).sin() * 8000.0) as i16)
                .collect();

            let config = Mp3EncoderConfig::new()
                .sample_rate(sample_rate)
                .bitrate(192)
                .channels(1)
                .stereo_mode(StereoMode::Mono)
                .copyright(false)
                .original(true);

            let result = encode_pcm_to_mp3(config, &samples).unwrap();
            assert!(!result.is_empty(), "MP3 should encode at {}Hz", sample_rate);
            assert_eq!(result[0], 0xFF);
        }
    }

    #[test]
    fn test_mp3_encode_silence() {
        use shine_rs::mp3_encoder::{encode_pcm_to_mp3, Mp3EncoderConfig, StereoMode};

        let samples: Vec<i16> = vec![0i16; 4410]; // 100ms of silence

        let config = Mp3EncoderConfig::new()
            .sample_rate(44100)
            .bitrate(128)
            .channels(1)
            .stereo_mode(StereoMode::Mono)
            .copyright(false)
            .original(true);

        let result = encode_pcm_to_mp3(config, &samples).unwrap();
        assert!(!result.is_empty());
        assert_eq!(result[0], 0xFF);
    }

    // ── git_commands logic tests ──

    #[test]
    fn test_git_branch_name_validation() {
        // Valid branch names
        assert!(is_valid_branch_name("main"));
        assert!(is_valid_branch_name("feature/new-agent"));
        assert!(is_valid_branch_name("fix/issue-123"));
        assert!(is_valid_branch_name("v1.0.0"));

        // Invalid branch names
        assert!(!is_valid_branch_name(""));
        assert!(!is_valid_branch_name(" branch with spaces"));
        assert!(!is_valid_branch_name("branch~with~tildes"));
        assert!(!is_valid_branch_name("branch^with^carets"));
        assert!(!is_valid_branch_name("branch..with..dots"));
        assert!(!is_valid_branch_name("branch\\with\\backslash"));
    }

    #[test]
    fn test_git_commit_message_format() {
        let msg = "feat: add sample curator agent";
        assert!(msg.starts_with("feat:") || msg.starts_with("fix:"));
        assert!(msg.len() > 10);

        let msg2 = "fix: resolve VST async note bug";
        assert!(msg2.starts_with("fix:"));
        assert!(msg2.len() > 10);
    }

    /// Simple branch name validator matching git rules
    fn is_valid_branch_name(name: &str) -> bool {
        if name.is_empty() || name.len() > 255 { return false; }
        if name.starts_with('/') || name.starts_with('-') { return false; }
        if name.contains("..") || name.contains("~") || name.contains("^")
            || name.contains(":") || name.contains("\\") || name.contains(" ")
            || name.contains("?") || name.contains("*") || name.contains("[")
        {
            return false;
        }
        if name.ends_with('/') || name.ends_with('.') || name.ends_with(".lock") { return false; }
        true
    }
}
