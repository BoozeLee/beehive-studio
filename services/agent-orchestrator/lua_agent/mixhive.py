"""MixHive Lua integration — publish, search, and manage from Lua scripts.

Provides both synchronous action generation (for Lua scripts) and async HTTP
transport (for actual API calls via the backend proxy).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx


@dataclass
class MixHiveTrack:
    id: str
    title: str
    artist_name: str
    artist_handle: str
    bpm: float
    key: str
    genre: str
    description: str
    tags: List[str]
    is_public: bool
    duration_secs: float
    audio_url: str
    created_at: str


@dataclass
class MixHivePublishResult:
    track_id: str
    url: str
    success: bool
    error: Optional[str] = None


class MixHiveLua:
    """
    Exposes MixHive operations to Lua scripts.
    - Sync methods generate action dicts consumed by Lua execute()
    - Async methods make real HTTP calls through the backend proxy
    """

    def __init__(
        self,
        api_url: str = "https://mixhive.vercel.app",
        proxy_base: str = "http://127.0.0.1:9876/api/mixes",
        api_key: str = "",
    ):
        self._api_url = api_url.rstrip("/")
        self._proxy_base = proxy_base.rstrip("/")
        self._api_key = api_key
        self._session_token: Optional[str] = None

    def authenticate(self, token: str) -> None:
        """Set the session token for authenticated requests."""
        self._session_token = token

    @property
    def is_authenticated(self) -> bool:
        return self._session_token is not None

    @property
    def _auth_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self._session_token:
            headers["Authorization"] = f"Bearer {self._session_token}"
        elif self._api_key:
            headers["X-API-Key"] = self._api_key
        return headers

    # ── Sync action generators (for Lua scripts) ──

    def publish_track(
        self,
        title: str,
        audio_path: str = "",
        bpm: float = 120.0,
        key: str = "C",
        genre: str = "",
        description: str = "",
        tags: Optional[List[str]] = None,
        is_public: bool = True,
    ) -> Dict[str, Any]:
        """Generate a publish action (consumed by Lua execute())."""
        return {
            "type": "mixhive_publish",
            "title": title,
            "audio_path": audio_path,
            "bpm": bpm,
            "key": key,
            "genre": genre,
            "description": description,
            "tags": tags or [],
            "is_public": is_public,
        }

    def search_tracks(
        self,
        query: str = "",
        limit: int = 20,
        genre: str = "",
        artist: str = "",
    ) -> Dict[str, Any]:
        """Generate a search action."""
        return {
            "type": "mixhive_search",
            "query": query,
            "limit": limit,
            "genre": genre,
            "artist": artist,
        }

    def get_track(self, track_id: str) -> Dict[str, Any]:
        """Generate a get-track action."""
        return {"type": "mixhive_get_track", "track_id": track_id}

    def get_artist_tracks(self, artist_handle: str, limit: int = 50) -> Dict[str, Any]:
        """Generate an artist-tracks action."""
        return {
            "type": "mixhive_artist_tracks",
            "artist_handle": artist_handle,
            "limit": limit,
        }

    def delete_track(self, track_id: str) -> Dict[str, Any]:
        """Generate a delete-track action."""
        return {"type": "mixhive_delete_track", "track_id": track_id}

    def update_metadata(
        self,
        track_id: str,
        title: Optional[str] = None,
        genre: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_public: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Generate a metadata-update action."""
        action: Dict[str, Any] = {
            "type": "mixhive_update_metadata",
            "track_id": track_id,
        }
        if title is not None:
            action["title"] = title
        if genre is not None:
            action["genre"] = genre
        if description is not None:
            action["description"] = description
        if tags is not None:
            action["tags"] = tags
        if is_public is not None:
            action["is_public"] = is_public
        return action

    # ── Async HTTP methods (for backend dispatch) ──

    async def publish_track_async(
        self,
        title: str,
        audio_path: str = "",
        bpm: float = 120.0,
        key: str = "C",
        genre: str = "",
        description: str = "",
        tags: Optional[List[str]] = None,
        is_public: bool = True,
    ) -> Dict[str, Any]:
        """Publish a track to MixHive via the backend proxy."""
        payload = {
            "title": title,
            "bpm": bpm,
            "key": key,
            "genre": genre,
            "description": description,
            "tags": tags or [],
            "isPublic": is_public,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self._proxy_base}/publish",
                json=payload,
                headers=self._auth_headers,
                timeout=30.0,
            )
        resp.raise_for_status()
        return resp.json()

    async def search_tracks_async(
        self,
        query: str = "",
        limit: int = 20,
        genre: str = "",
        artist: str = "",
    ) -> Dict[str, Any]:
        """Search MixHive tracks via the backend proxy."""
        params: Dict[str, Any] = {"limit": limit}
        if query:
            params["q"] = query
        if genre:
            params["genre"] = genre
        if artist:
            params["artist"] = artist
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self._proxy_base}/search",
                params=params,
                headers=self._auth_headers,
                timeout=15.0,
            )
        resp.raise_for_status()
        return resp.json()

    async def get_track_async(self, track_id: str) -> Dict[str, Any]:
        """Get a track from MixHive via the backend proxy."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self._proxy_base}/track/{track_id}",
                headers=self._auth_headers,
                timeout=15.0,
            )
        resp.raise_for_status()
        return resp.json()

    async def get_artist_tracks_async(
        self, artist_handle: str, limit: int = 50
    ) -> Dict[str, Any]:
        """Get artist tracks via the backend proxy."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self._proxy_base}/artist/{artist_handle}",
                params={"limit": limit},
                headers=self._auth_headers,
                timeout=15.0,
            )
        resp.raise_for_status()
        return resp.json()

    async def delete_track_async(self, track_id: str) -> Dict[str, Any]:
        """Delete a track via the backend proxy."""
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{self._proxy_base}/track/{track_id}",
                headers=self._auth_headers,
                timeout=15.0,
            )
        resp.raise_for_status()
        return resp.json()

    async def update_metadata_async(
        self,
        track_id: str,
        title: Optional[str] = None,
        genre: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_public: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update track metadata via the backend proxy."""
        payload: Dict[str, Any] = {}
        if title is not None:
            payload["title"] = title
        if genre is not None:
            payload["genre"] = genre
        if description is not None:
            payload["description"] = description
        if tags is not None:
            payload["tags"] = tags
        if is_public is not None:
            payload["isPublic"] = is_public
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{self._proxy_base}/track/{track_id}",
                json=payload,
                headers=self._auth_headers,
                timeout=15.0,
            )
        resp.raise_for_status()
        return resp.json()
