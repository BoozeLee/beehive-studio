"""Unified inference client: vLLM primary, Ollama fallback."""
import os
from typing import AsyncIterator
import httpx

VLLM_URL = os.getenv("BEEHIVE_VLLM_URL", "http://localhost:8000/v1")
VLLM_MODEL = os.getenv("BEEHIVE_VLLM_MODEL", "microsoft/Phi-4-mini-instruct")
OLLAMA_URL = os.getenv("BEEHIVE_OLLAMA_URL", "http://localhost:11434")
FALLBACK = os.getenv("BEEHIVE_FALLBACK_PROVIDER", "ollama")


class InferenceClient:
    def __init__(self):
        self.vllm_http = httpx.AsyncClient(base_url=VLLM_URL, timeout=120.0)
        self.ollama_http = httpx.AsyncClient(base_url=OLLAMA_URL, timeout=120.0)

    async def chat(self, messages: list[dict], stream: bool = False) -> dict:
        """Chat completion with automatic fallback."""
        try:
            return await self._vllm_chat(messages, stream)
        except Exception as e:
            if FALLBACK == "ollama":
                return await self._ollama_chat(messages, stream)
            raise

    async def _vllm_chat(self, messages: list[dict], stream: bool) -> dict:
        payload = {
            "model": VLLM_MODEL,
            "messages": messages,
            "stream": stream,
            "temperature": 0.8,
            "max_tokens": 2048,
        }
        if stream:
            return self._vllm_stream(payload)
        r = await self.vllm_http.post("/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()

    async def _vllm_stream(self, payload: dict) -> AsyncIterator[str]:
        async with self.vllm_http.stream("POST", "/chat/completions", json=payload) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if line.startswith("data: "):
                    yield line[6:]

    async def _ollama_chat(self, messages: list[dict], stream: bool) -> dict:
        payload = {
            "model": os.getenv("BEEHIVE_MODEL", "llama3.2"),
            "messages": messages,
            "stream": stream,
        }
        r = await self.ollama_http.post("/api/chat", json=payload)
        r.raise_for_status()
        return r.json()

    async def health(self) -> dict:
        """Check all inference providers."""
        result = {"vllm": False, "ollama": False}
        try:
            r = await self.vllm_http.get("/models", timeout=5.0)
            result["vllm"] = r.status_code == 200
        except Exception:
            pass
        try:
            r = await self.ollama_http.get("/api/tags", timeout=5.0)
            result["ollama"] = r.status_code == 200
        except Exception:
            pass
        return result


inference_client = InferenceClient()
