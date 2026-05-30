"""
Baker Street Labs Integration for Beehive Studio

Provides research capabilities by calling the local Baker Street API.
Baker Street runs on port 3001 (Next.js frontend) with a Python neuromorphic
service on port 8001.

Endpoints:
- POST /api/research-multiagent  → structured research with subtasks
- POST /api/research-stream      → streaming SSE research
"""

from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator, Dict

import httpx

BSL_BASE_URL = os.environ.get("BAKER_STREET_URL", "http://localhost:3001")
BSL_API_KEY = os.environ.get("BAKER_STREET_API_KEY", "")


async def research_multiagent(
    query: str,
    mode: str = "full",
    agent: str = "orchestrator",
) -> Dict[str, Any]:
    """
    Call Baker Street's multi-agent research endpoint.

    Args:
        query: The research question (e.g. "best chord progression for lo-fi hip hop")
        mode: "quick" or "full"
        agent: "orchestrator", "scientific", "creative", "code", "legal", "vision"

    Returns:
        Structured research report with ai_analysis, web_results, subtasks
    """
    url = f"{BSL_BASE_URL}/api/research-multiagent"
    payload = {
        "query": query,
        "mode": mode,
        "agent": agent,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            return {
                "status": "error",
                "message": f"Baker Street not available at {BSL_BASE_URL}. Is it running?",
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e),
            }


async def research_stream(
    query: str,
    agent: str = "orchestrator",
    neuromorphic: bool = True,
    polymorphic: bool = True,
) -> AsyncIterator[str]:
    """
    Stream research results from Baker Street's SSE endpoint.

    Yields text tokens as they arrive from the LLM.
    """
    url = f"{BSL_BASE_URL}/api/research-stream"
    payload = {
        "query": query,
        "agent": agent,
        "mode": "full",
        "neuromorphic": neuromorphic,
        "polymorphic": polymorphic,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            parsed = json.loads(data)
                            if "token" in parsed:
                                yield parsed["token"]
                            elif "text" in parsed:
                                yield parsed["text"]
                        except json.JSONDecodeError:
                            yield data
        except httpx.ConnectError:
            yield f"[ERROR: Baker Street not available at {BSL_BASE_URL}]"
        except Exception as e:
            yield f"[ERROR: {str(e)}]"


def format_research_for_agent(raw_research: Dict[str, Any]) -> str:
    """
    Convert Baker Street research output into a concise context string
    that can be injected into an agent's prompt.
    """
    if raw_research.get("status") == "error":
        return f"[Research unavailable: {raw_research.get('message', 'unknown error')}]"

    parts = []

    ai_analysis = raw_research.get("ai_analysis", "")
    if ai_analysis:
        parts.append(f"Research Analysis:\n{ai_analysis[:2000]}")

    web_results = raw_research.get("web_results", [])
    if web_results:
        parts.append("\nWeb Sources:")
        for i, result in enumerate(web_results[:5], 1):
            title = result.get("title", "Untitled")
            _url = result.get("url", "")
            snippet = result.get("snippet", "")[:200]
            parts.append(f"  {i}. {title} — {snippet}")

    subtasks = raw_research.get("subtasks", [])
    if subtasks:
        parts.append("\nInvestigation Breakdown:")
        for task in subtasks[:5]:
            agent_type = task.get("agent", "unknown")
            task_query = task.get("query", "")
            parts.append(f"  • {agent_type}: {task_query}")

    return "\n".join(parts) if parts else "[No research context available]"
