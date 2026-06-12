"""
AudioCraft FastAPI Server
Provides REST API for music generation using AudioCraft models
"""

import asyncio
import os
import logging
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
import aiohttp
import json
import io
from pathlib import Path

# Import AudioCraft components
try:
    from audiocraft.models import MusicGen
    from audiocraft.utils import download_all_models
    AUDIOCRAFT_AVAILABLE = True
except ImportError:
    AUDIOCRAFT_AVAILABLE = False
    print("Warning: AudioCraft not available. Install with: pip install audiocraft")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AudioCraft Music Generation API",
    description="API for generating music using AudioCraft models",
    version="1.0.0"
)

# Global variables
music_model: Optional[MusicGen] = None
model_download_lock = asyncio.Lock()

class MusicGenerationRequest:
    """Request model for music generation"""
    prompt: str
    duration: int = 30
    genre: Optional[str] = None
    bpm: Optional[int] = None
    style: Optional[str] = None
    quality: str = "high"
    model_name: str = "small"
    temperature: float = 1.0
    top_k: int = 250

class GenerationResult:
    """Result model for music generation"""
    success: bool
    audio_url: Optional[str] = None
    audio_data: Optional[bytes] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    """Initialize the application"""
    logger.info("Starting AudioCraft API server")
    
    if not AUDIOCRAFT_AVAILABLE:
        logger.error("AudioCraft not available")
        return
    
    # Download models on startup
    await download_models()

async def download_models():
    """Download AudioCraft models"""
    global music_model
    
    if not AUDIOCRAFT_AVAILABLE:
        return
    
    async with model_download_lock:
        if music_model is not None:
            return
        
        try:
            logger.info("Downloading AudioCraft models...")
            await download_all_models()
            logger.info("Models downloaded successfully")
            
            # Initialize the model
            music_model = MusicGen.get_pretrained('small')
            logger.info("AudioCraft model initialized")
            
        except Exception as e:
            logger.error(f"Error downloading models: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to download models: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if music_model else "loading",
        "audiocraft_available": AUDIOCRAFT_AVAILABLE,
        "model_loaded": music_model is not None
    }

@app.post("/generate")
async def generate_music(request: MusicGenerationRequest):
    """Generate music from text prompt"""
    if not AUDIOCRAFT_AVAILABLE:
        raise HTTPException(status_code=500, detail="AudioCraft not available")
    
    if music_model is None:
        raise HTTPException(status_code=503, detail="Model still loading")
    
    try:
        logger.info(f"Generating music: {request.prompt}")
        
        # Prepare generation parameters
        generation_params = {
            "prompt": request.prompt,
            "duration": request.duration,
            "model_name": request.model_name,
            "temperature": request.temperature,
            "top_k": request.top_k
        }
        
        # Generate music
        if request.genre:
            generation_params["genre"] = request.genre
        
        # Generate the music
        output = music_model.generate(**generation_params)
        
        # Convert to audio format
        audio_data = output.cpu().numpy()
        
        # Create metadata
        metadata = {
            "prompt": request.prompt,
            "duration": request.duration,
            "model": request.model_name,
            "temperature": request.temperature,
            "top_k": request.top_k,
            "genre": request.genre,
            "style": request.style,
            "quality": request.quality,
            "sample_rate": 32000,
            "channels": 1,
            "samples": len(audio_data)
        }
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(audio_data.tobytes()),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=generated_music.wav",
                "X-Metadata": json.dumps(metadata)
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate music: {str(e)}")

@app.post("/generate/stream")
async def generate_music_stream(request: MusicGenerationRequest):
    """Generate music and return as stream"""
    if not AUDIOCRAFT_AVAILABLE:
        raise HTTPException(status_code=500, detail="AudioCraft not available")
    
    if music_model is None:
        raise HTTPException(status_code=503, detail="Model still loading")
    
    try:
        logger.info(f"Generating music stream: {request.prompt}")
        
        # Prepare generation parameters
        generation_params = {
            "prompt": request.prompt,
            "duration": request.duration,
            "model_name": request.model_name,
            "temperature": request.temperature,
            "top_k": request.top_k
        }
        
        # Generate music
        output = music_model.generate(**generation_params)
        
        # Convert to audio format
        audio_data = output.cpu().numpy()
        
        # Create metadata
        metadata = {
            "prompt": request.prompt,
            "duration": request.duration,
            "model": request.model_name,
            "temperature": request.temperature,
            "top_k": request.top_k,
            "genre": request.genre,
            "style": request.style,
            "quality": request.quality,
            "sample_rate": 32000,
            "channels": 1,
            "samples": len(audio_data)
        }
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(audio_data.tobytes()),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=generated_music.wav",
                "X-Metadata": json.dumps(metadata)
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate music: {str(e)}")

@app.get("/models")
async def get_available_models():
    """Get available AudioCraft models"""
    if not AUDIOCRAFT_AVAILABLE:
        raise HTTPException(status_code=500, detail="AudioCraft not available")
    
    try:
        return {
            "models": ["small", "medium", "large"],
            "default": "small",
            "description": {
                "small": "Fast generation, lower quality",
                "medium": "Balanced speed and quality",
                "large": "High quality, slower generation"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")

@app.get("/prompts")
async def get_example_prompts():
    """Get example music generation prompts"""
    return {
        "prompts": [
            "calm piano melody",
            "electronic dance music with synthesizers",
            "rock song with electric guitar",
            "classical orchestral piece",
            "jazz with saxophone and piano",
            "ambient atmospheric music",
            "hip hop beat with bass and drums",
            "acoustic folk song with guitar",
            "orchestral film score",
            "techno music with heavy bass"
        ]
    }

@app.post("/models/download")
async def download_model(model_name: str):
    """Download a specific AudioCraft model"""
    if not AUDIOCRAFT_AVAILABLE:
        raise HTTPException(status_code=500, detail="AudioCraft not available")
    
    try:
        logger.info(f"Downloading model: {model_name}")
        
        # Download the model
        music_model = MusicGen.get_pretrained(model_name)
        
        return {
            "success": True,
            "model": model_name,
            "message": f"Model {model_name} downloaded successfully"
        }
        
    except Exception as e:
        logger.error(f"Error downloading model: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to download model: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)