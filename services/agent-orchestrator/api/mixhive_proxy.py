"""MixHive API proxy — routes Lua agent MixHive actions to the live API."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/mixes", tags=["mixhive"])

logger = logging.getLogger(__name__)

MIXHIVE_BASE = "https://mixhive.vercel.app"
SUPABASE_URL = "https://ljdolmqytncxhgojqguh.supabase.co"


async def _proxy_headers(authorization: Optional[str] = None) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if authorization:
        headers["Authorization"] = authorization
    return headers


@router.post("/publish")
async def proxy_publish(body: Dict[str, Any], authorization: Optional[str] = None):
    """Proxy a publish action from Lua to MixHive."""
    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MIXHIVE_BASE}/api/mixes/publish",
            json=body,
            headers=headers,
            timeout=30.0,
        )
    if resp.is_error:
        logger.error(f"MixHive publish failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/search")
async def proxy_search(
    q: str = "",
    limit: int = 20,
    genre: str = "",
    artist: str = "",
    authorization: Optional[str] = None,
):
    """Proxy a search action from Lua to MixHive."""
    params: Dict[str, Any] = {"limit": limit}
    if q:
        params["q"] = q
    if genre:
        params["genre"] = genre
    if artist:
        params["artist"] = artist

    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MIXHIVE_BASE}/api/mixes",
            params=params,
            headers=headers,
            timeout=15.0,
        )
    if resp.is_error:
        logger.error(f"MixHive search failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/track/{track_id}")
async def proxy_get_track(track_id: str, authorization: Optional[str] = None):
    """Proxy a get-track action from Lua to MixHive."""
    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MIXHIVE_BASE}/api/mixes/{track_id}",
            headers=headers,
            timeout=15.0,
        )
    if resp.is_error:
        logger.error(f"MixHive get track failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/artist/{handle}")
async def proxy_artist_tracks(
    handle: str,
    limit: int = 50,
    authorization: Optional[str] = None,
):
    """Proxy an artist-tracks action from Lua to MixHive."""
    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MIXHIVE_BASE}/api/artists/{handle}/tracks",
            params={"limit": limit},
            headers=headers,
            timeout=15.0,
        )
    if resp.is_error:
        logger.error(f"MixHive artist tracks failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.delete("/track/{track_id}")
async def proxy_delete_track(track_id: str, authorization: Optional[str] = None):
    """Proxy a delete-track action from Lua to MixHive."""
    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MIXHIVE_BASE}/api/mixes/{track_id}",
            headers=headers,
            timeout=15.0,
        )
    if resp.is_error:
        logger.error(f"MixHive delete track failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"status": "deleted", "track_id": track_id}


@router.patch("/track/{track_id}")
async def proxy_update_metadata(
    track_id: str,
    body: Dict[str, Any],
    authorization: Optional[str] = None,
):
    """Proxy a metadata-update action from Lua to MixHive."""
    headers = await _proxy_headers(authorization)
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{MIXHIVE_BASE}/api/mixes/{track_id}",
            json=body,
            headers=headers,
            timeout=15.0,
        )
    if resp.is_error:
        logger.error(f"MixHive update metadata failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()
