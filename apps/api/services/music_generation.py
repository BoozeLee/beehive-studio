"""
Music Generation Service Integration
Integrates multiple music generation APIs for Beehive Studio
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import aiohttp
import io

logger = logging.getLogger(__name__)

class MusicProvider(Enum):
    """Supported music generation providers"""
    AUDIOCRAFT = "audiocraft"
    MUBERT = "mubert"
    SOUNDRAW = "soundraw"
    SUNO = "suno"

@dataclass
class MusicGenerationRequest:
    """Data class for music generation requests"""
    prompt: str
    duration: int = 30  # seconds
    genre: Optional[str] = None
    bpm: Optional[int] = None
    style: Optional[str] = None
    provider: MusicProvider = MusicProvider.AUDIOCRAFT
    quality: str = "high"

@dataclass
class MusicGenerationResult:
    """Data class for music generation results"""
    success: bool
    audio_url: Optional[str] = None
    audio_data: Optional[bytes] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    provider: Optional[MusicProvider] = None

class MusicGenerationService:
    """Main service for handling music generation requests"""
    
    def __init__(self):
        self.providers = {}
        self.session = None
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize all music generation providers"""
        self.providers[MusicProvider.AUDIOCRAFT] = AudioCraftProvider()
        self.providers[MusicProvider.MUBERT] = MubertProvider()
        self.providers[MusicProvider.SOUNDRAW] = SoundrawProvider()
        self.providers[MusicProvider.SUNO] = SunoProvider()
    
    async def generate_music(self, request: MusicGenerationRequest) -> MusicGenerationResult:
        """Generate music using the specified provider"""
        if not self.session:
            self.session = aiohttp.ClientSession()
        
        provider = self.providers.get(request.provider)
        if not provider:
            return MusicGenerationResult(
                success=False,
                error=f"Provider {request.provider} not supported"
            )
        
        try:
            logger.info(f"Generating music with {request.provider.value}: {request.prompt}")
            result = await provider.generate(request, self.session)
            result.provider = request.provider
            return result
        except Exception as e:
            logger.error(f"Error generating music with {request.provider.value}: {str(e)}")
            return MusicGenerationResult(
                success=False,
                error=str(e),
                provider=request.provider
            )
        finally:
            if self.session:
                await self.session.close()

class AudioCraftProvider:
    """AudioCraft (Meta) provider implementation"""
    
    def __init__(self):
        self.base_url = "http://localhost:8000"  # Local AudioCraft server
        self.model_name = "MusicGen"
    
    async def generate(self, request: MusicGenerationRequest, session: aiohttp.ClientSession) -> MusicGenerationResult:
        """Generate music using AudioCraft"""
        try:
            payload = {
                "prompt": request.prompt,
                "duration": request.duration,
                "genre": request.genre,
                "bpm": request.bpm,
                "style": request.style,
                "quality": request.quality
            }
            
            async with session.post(f"{self.base_url}/generate", json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    return MusicGenerationResult(
                        success=True,
                        audio_url=data.get("audio_url"),
                        metadata=data.get("metadata", {})
                    )
                else:
                    error_text = await response.text()
                    return MusicGenerationResult(
                        success=False,
                        error=f"AudioCraft API error: {error_text}"
                    )
        except Exception as e:
            return MusicGenerationResult(
                success=False,
                error=f"AudioCraft connection error: {str(e)}"
            )

class MubertProvider:
    """Mubert API provider implementation"""
    
    def __init__(self):
        self.api_key = None  # Set your Mubert API key
        self.base_url = "https://api.mubert.com"
    
    async def generate(self, request: MusicGenerationRequest, session: aiohttp.ClientSession) -> MusicGenerationResult:
        """Generate music using Mubert API"""
        if not self.api_key:
            return MusicGenerationResult(
                success=False,
                error="Mubert API key not configured"
            )
        
        try:
            payload = {
                "token": self.api_key,
                "duration": request.duration,
                "mood": request.prompt,
                "genre": request.genre,
                "format": "mp3"
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with session.post(f"{self.base_url}/v2/generation", json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return MusicGenerationResult(
                        success=True,
                        audio_url=data.get("track_url"),
                        metadata=data.get("metadata", {})
                    )
                else:
                    error_text = await response.text()
                    return MusicGenerationResult(
                        success=False,
                        error=f"Mubert API error: {error_text}"
                    )
        except Exception as e:
            return MusicGenerationResult(
                success=False,
                error=f"Mubert connection error: {str(e)}"
            )

class SoundrawProvider:
    """Soundraw API provider implementation"""
    
    def __init__(self):
        self.api_key = None  # Set your Soundraw API key
        self.base_url = "https://api.soundraw.io"
    
    async def generate(self, request: MusicGenerationRequest, session: aiohttp.ClientSession) -> MusicGenerationResult:
        """Generate music using Soundraw API"""
        if not self.api_key:
            return MusicGenerationResult(
                success=False,
                error="Soundraw API key not configured"
            )
        
        try:
            payload = {
                "api_key": self.api_key,
                "prompt": request.prompt,
                "duration": request.duration,
                "genre": request.genre,
                "style": request.style,
                "quality": request.quality
            }
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with session.post(f"{self.base_url}/generate", json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return MusicGenerationResult(
                        success=True,
                        audio_url=data.get("audio_url"),
                        metadata=data.get("metadata", {})
                    )
                else:
                    error_text = await response.text()
                    return MusicGenerationResult(
                        success=False,
                        error=f"Soundraw API error: {error_text}"
                    )
        except Exception as e:
            return MusicGenerationResult(
                success=False,
                error=f"Soundraw connection error: {str(e)}"
            )

class SunoProvider:
    """Suno AI provider implementation"""
    
    def __init__(self):
        self.base_url = "https://api.suno.ai"
    
    async def generate(self, request: MusicGenerationRequest, session: aiohttp.ClientSession) -> MusicGenerationResult:
        """Generate music using Suno AI"""
        try:
            payload = {
                "prompt": request.prompt,
                "duration": request.duration,
                "genre": request.genre,
                "style": request.style,
                "make_instrumental": False  # Include vocals
            }
            
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "BeehiveStudio/1.0"
            }
            
            async with session.post(f"{self.base_url}/v1/generate", json=payload, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return MusicGenerationResult(
                        success=True,
                        audio_url=data.get("audio_url"),
                        metadata=data.get("metadata", {})
                    )
                else:
                    error_text = await response.text()
                    return MusicGenerationResult(
                        success=False,
                        error=f"Suno AI API error: {error_text}"
                    )
        except Exception as e:
            return MusicGenerationResult(
                success=False,
                error=f"Suno AI connection error: {str(e)}"
            )

# FastAPI endpoints
def create_music_generation_routes():
    """Create FastAPI routes for music generation"""
    from fastapi import APIRouter, HTTPException, Depends
    from fastapi.responses import StreamingResponse
    
    router = APIRouter()
    music_service = MusicGenerationService()
    
    @router.post("/music/generate")
    async def generate_music(request: MusicGenerationRequest):
        """Generate music using specified provider"""
        result = await music_service.generate_music(request)
        
        if result.success:
            return {
                "success": True,
                "audio_url": result.audio_url,
                "metadata": result.metadata,
                "provider": result.provider.value if result.provider else None
            }
        else:
            raise HTTPException(status_code=500, detail=result.error)
    
    @router.get("/music/providers")
    async def get_providers():
        """Get available music generation providers"""
        return {
            "providers": [
                {
                    "name": provider.value,
                    "description": provider.name,
                    "commercial_use": get_provider_commercial_use(provider)
                }
                for provider in MusicProvider
            ]
        }
    
    @router.get("/music/providers/{provider_name}/health")
    async def check_provider_health(provider_name: str):
        """Check if a music provider is healthy"""
        try:
            provider = MusicProvider(provider_name.lower())
            provider_instance = music_service.providers.get(provider)
            
            if provider_instance:
                return {"healthy": True, "provider": provider_name}
            else:
                return {"healthy": False, "provider": provider_name, "error": "Provider not found"}
        except ValueError:
            return {"healthy": False, "provider": provider_name, "error": "Invalid provider name"}
    
    return router

def get_provider_commercial_use(provider: MusicProvider) -> str:
    """Get commercial use policy for each provider"""
    policies = {
        MusicProvider.AUDIOCRAFT: "Fully allowed (MIT license)",
        MusicProvider.MUBERT: "Royalty-free for commercial use",
        MusicProvider.SOUNDRAW: "Allowed on all plans",
        MusicProvider.SUNO: "Free tier: No commercial rights"
    }
    return policies.get(provider, "Unknown")

# Configuration management
class MusicGenerationConfig:
    """Configuration for music generation services"""
    
    def __init__(self):
        self.providers = {}
        self._load_config()
    
    def _load_config(self):
        """Load configuration from environment variables or config file"""
        import os
        
        # AudioCraft configuration
        self.providers["audiocraft"] = {
            "enabled": os.getenv("AUDIOCRAFT_ENABLED", "true").lower() == "true",
            "host": os.getenv("AUDIOCRAFT_HOST", "localhost"),
            "port": os.getenv("AUDIOCRAFT_PORT", "8000"),
            "model": os.getenv("AUDIOCRAFT_MODEL", "MusicGen")
        }
        
        # Mubert configuration
        self.providers["mubert"] = {
            "enabled": os.getenv("MUBERT_ENABLED", "false").lower() == "true",
            "api_key": os.getenv("MUBERT_API_KEY"),
            "base_url": os.getenv("MUBERT_BASE_URL", "https://api.mubert.com")
        }
        
        # Soundraw configuration
        self.providers["soundraw"] = {
            "enabled": os.getenv("SOUNDRAW_ENABLED", "false").lower() == "true",
            "api_key": os.getenv("SOUNDRAW_API_KEY"),
            "base_url": os.getenv("SOUNDRAW_BASE_URL", "https://api.soundraw.io")
        }
        
        # Suno configuration
        self.providers["suno"] = {
            "enabled": os.getenv("SUNO_ENABLED", "true").lower() == "true",
            "base_url": os.getenv("SUNO_BASE_URL", "https://api.suno.ai")
        }
    
    def get_enabled_providers(self) -> List[MusicProvider]:
        """Get list of enabled providers"""
        enabled = []
        for provider_name, config in self.providers.items():
            if config.get("enabled", False):
                try:
                    enabled.append(MusicProvider(provider_name))
                except ValueError:
                    continue
        return enabled