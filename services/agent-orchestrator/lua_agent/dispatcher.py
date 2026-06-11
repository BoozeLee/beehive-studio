"""Action dispatcher — routes Lua-generated actions to their handlers."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class ActionRouter:
    """
    Routes action dicts from Lua scripts to appropriate handlers.
    Lua actions (note_on, play, etc.) are returned as-is.
    MixHive actions are dispatched to the backend proxy.
    """

    def __init__(self, mixhive_api_url: str = "https://mixhive.vercel.app"):
        self._mixhive_api_url = mixhive_api_url.rstrip("/")
        self._proxy_base = "http://127.0.0.1:9876/api/mixes"
        self._actions_dispatched = 0
        self._actions_failed = 0

    @property
    def stats(self) -> Dict[str, int]:
        return {
            "dispatched": self._actions_dispatched,
            "failed": self._actions_failed,
        }

    def route(self, actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Route a list of actions. Lua-native actions are passed through.
        MixHive actions are dispatched to the backend proxy.
        Returns enriched action list with results.
        """
        routed = []
        for action in actions:
            action_type = action.get("type", "")
            if action_type.startswith("mixhive_"):
                result = self._dispatch_mixhive(action)
                routed.append(result)
            else:
                routed.append(action)
        return routed

    def _dispatch_mixhive(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch a MixHive action. Currently returns action for backend processing."""
        action_type = action.get("type", "")
        self._actions_dispatched += 1

        if action_type == "mixhive_publish":
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/publish",
                "_method": "POST",
                "_status": "queued",
            }
        elif action_type == "mixhive_search":
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/search",
                "_method": "GET",
                "_status": "queued",
            }
        elif action_type == "mixhive_get_track":
            track_id = action.get("track_id", "")
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/track/{track_id}",
                "_method": "GET",
                "_status": "queued",
            }
        elif action_type == "mixhive_artist_tracks":
            handle = action.get("artist_handle", "")
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/artist/{handle}",
                "_method": "GET",
                "_status": "queued",
            }
        elif action_type == "mixhive_delete_track":
            track_id = action.get("track_id", "")
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/track/{track_id}",
                "_method": "DELETE",
                "_status": "queued",
            }
        elif action_type == "mixhive_update_metadata":
            track_id = action.get("track_id", "")
            return {
                **action,
                "_proxy_url": f"{self._proxy_base}/track/{track_id}",
                "_method": "PATCH",
                "_status": "queued",
            }
        else:
            self._actions_failed += 1
            return {**action, "_status": "unknown_action", "_error": f"Unknown action type: {action_type}"}
