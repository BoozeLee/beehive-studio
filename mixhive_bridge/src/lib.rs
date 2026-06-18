//! # MixHive Bridge
//!
//! Provides a typed Rust client for the MixHive social platform API.
//! Used by Beehive Studio IDE to publish tracks, fetch user profiles,
//! manage collaborations, and sync with the MixHive ecosystem.
//!
//! ## Architecture
//! ```text
//! Beehive Studio (Tauri) → mixhive_bridge (this crate) → MixHive REST API
//! ```

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{info, warn};

// ─── Error Types ──────────────────────────────────────────────────────────────

#[derive(Error, Debug)]
pub enum BridgeError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("API returned error: {status} — {message}")]
    ApiError { status: u16, message: String },

    #[error("Serialization error: {0}")]
    SerdeError(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, BridgeError>;

// ─── Data Models ──────────────────────────────────────────────────────────────

/// A track to be published from Beehive Studio to MixHive.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub genre: Option<String>,
    pub bpm: Option<f32>,
    pub key: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    /// Base64-encoded audio data (WAV/MP3/FLAC)
    pub audio_data: Option<String>,
    /// Base64-encoded cover art (PNG/JPEG)
    pub cover_art: Option<String>,
}

/// Response from MixHive after a track is published.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PublishResponse {
    pub track_id: String,
    pub url: String,
    pub status: String,
}

/// MixHive user profile.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub followers: u64,
    pub following: u64,
}

/// A collaboration quest from MixHive.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollabQuest {
    pub id: String,
    pub title: String,
    pub description: String,
    pub creator: String,
    pub status: String,
    pub participants: Vec<String>,
    pub xp_reward: u64,
}

// ─── Client ───────────────────────────────────────────────────────────────────

/// Main client for interacting with the MixHive API.
#[derive(Debug, Clone)]
pub struct MixHiveClient {
    base_url: String,
    auth_token: Option<String>,
    http: reqwest::Client,
}

impl MixHiveClient {
    /// Create a new MixHive client.
    ///
    /// # Arguments
    /// * `base_url` — The MixHive API base URL (e.g., `https://mixhive.vercel.app/api`).
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            auth_token: None,
            http: reqwest::Client::new(),
        }
    }

    /// Authenticate with a Supabase JWT token.
    pub fn with_auth(mut self, token: impl Into<String>) -> Self {
        self.auth_token = Some(token.into());
        self
    }

    /// Build the Authorization header value.
    fn auth_header(&self) -> Result<String> {
        self.auth_token
            .as_ref()
            .map(|t| format!("Bearer {}", t))
            .ok_or_else(|| BridgeError::AuthError("No auth token set".into()))
    }

    // ── Track Operations ──────────────────────────────────────────────────

    /// Publish a track from Beehive Studio to MixHive.
    pub async fn publish_track(&self, track: &Track) -> Result<PublishResponse> {
        info!(title = %track.title, artist = %track.artist, "Publishing track to MixHive");

        let url = format!("{}/tracks", self.base_url);
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header()?)
            .json(track)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            warn!(status, body = %body, "Track publish failed");
            return Err(BridgeError::ApiError {
                status,
                message: body,
            });
        }

        let publish_resp: PublishResponse = resp.json().await?;
        info!(track_id = %publish_resp.track_id, "Track published successfully");
        Ok(publish_resp)
    }

    // ── User Operations ───────────────────────────────────────────────────

    /// Fetch the authenticated user's profile.
    pub async fn get_my_profile(&self) -> Result<UserProfile> {
        let url = format!("{}/users/me", self.base_url);
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header()?)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BridgeError::ApiError {
                status,
                message: body,
            });
        }

        Ok(resp.json().await?)
    }

    /// Fetch a user profile by username.
    pub async fn get_user(&self, username: &str) -> Result<UserProfile> {
        let url = format!("{}/users/{}", self.base_url, username);
        let resp = self.http.get(&url).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BridgeError::ApiError {
                status,
                message: body,
            });
        }

        Ok(resp.json().await?)
    }

    // ── Collab Quests ─────────────────────────────────────────────────────

    /// List available collaboration quests.
    pub async fn list_quests(&self) -> Result<Vec<CollabQuest>> {
        let url = format!("{}/quests", self.base_url);
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header()?)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BridgeError::ApiError {
                status,
                message: body,
            });
        }

        Ok(resp.json().await?)
    }

    /// Join a collaboration quest by ID.
    pub async fn join_quest(&self, quest_id: &str) -> Result<CollabQuest> {
        info!(quest_id, "Joining collab quest");
        let url = format!("{}/quests/{}/join", self.base_url, quest_id);
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header()?)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BridgeError::ApiError {
                status,
                message: body,
            });
        }

        Ok(resp.json().await?)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = MixHiveClient::new("https://mixhive.vercel.app/api");
        assert_eq!(client.base_url, "https://mixhive.vercel.app/api");
        assert!(client.auth_token.is_none());
    }

    #[test]
    fn test_client_with_auth() {
        let client = MixHiveClient::new("https://mixhive.vercel.app/api")
            .with_auth("test-jwt-token");
        assert!(client.auth_token.is_some());
        assert_eq!(client.auth_token.unwrap(), "test-jwt-token");
    }

    #[test]
    fn test_track_serialization() {
        let track = Track {
            title: "Midnight Techno".into(),
            artist: "DJ Nef".into(),
            genre: Some("Techno".into()),
            bpm: Some(130.0),
            key: Some("Am".into()),
            description: Some("A deep techno journey".into()),
            tags: vec!["techno".into(), "dark".into(), "underground".into()],
            audio_data: None,
            cover_art: None,
        };
        let json = serde_json::to_string(&track).unwrap();
        assert!(json.contains("Midnight Techno"));
        assert!(json.contains("130.0"));
    }
}
