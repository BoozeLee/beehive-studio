"""
Music Generation Orchestrator
Coordinates multiple music generation APIs and provides unified interface
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from enum import Enum
import aiohttp
from datetime import datetime, timedelta

# Import the music generation service
from services.music_generation import (
    MusicGenerationRequest, 
    MusicGenerationResult, 
    MusicGenerationService,
    MusicProvider
)

logger = logging.getLogger(__name__)

class MusicTaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"

@dataclass
class MusicGenerationTask:
    """Represents a music generation task"""
    id: str
    request: MusicGenerationRequest
    status: MusicTaskStatus
    result: Optional[MusicGenerationResult] = None
    created_at: datetime = None
    updated_at: datetime = None
    retry_count: int = 0
    max_retries: int = 3
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        self.updated_at = self.created_at

class MusicOrchestrator:
    """Main orchestrator for music generation services"""
    
    def __init__(self):
        self.music_service = MusicGenerationService()
        self.tasks: Dict[str, MusicGenerationTask] = {}
        self.session: Optional[aiohttp.ClientSession] = None
        self.task_queue = asyncio.Queue()
        self.is_running = False
        
    async def initialize(self):
        """Initialize the orchestrator"""
        self.session = aiohttp.ClientSession()
        self.is_running = True
        asyncio.create_task(self._process_tasks())
        
    async def shutdown(self):
        """Shutdown the orchestrator"""
        self.is_running = False
        if self.session:
            await self.session.close()
    
    async def generate_music(self, request: MusicGenerationRequest) -> str:
        """Generate music and return task ID"""
        task_id = f"music_task_{datetime.utcnow().timestamp()}"
        
        task = MusicGenerationTask(
            id=task_id,
            request=request,
            status=MusicTaskStatus.PENDING,
            max_retries=3
        )
        
        self.tasks[task_id] = task
        await self.task_queue.put(task_id)
        
        logger.info(f"Created music generation task: {task_id}")
        return task_id
    
    async def get_task_status(self, task_id: str) -> Optional[MusicGenerationTask]:
        """Get the status of a task"""
        return self.tasks.get(task_id)
    
    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a task"""
        if task_id in self.tasks:
            task = self.tasks[task_id]
            if task.status in [MusicTaskStatus.PENDING, MusicTaskStatus.PROCESSING]:
                task.status = MusicTaskStatus.FAILED
                task.updated_at = datetime.utcnow()
                logger.info(f"Cancelled task: {task_id}")
                return True
        return False
    
    async def get_task_result(self, task_id: str) -> Optional[MusicGenerationResult]:
        """Get the result of a completed task"""
        if task_id in self.tasks:
            task = self.tasks[task_id]
            if task.status == MusicTaskStatus.COMPLETED:
                return task.result
        return None
    
    async def _process_tasks(self):
        """Process tasks from the queue"""
        while self.is_running:
            try:
                task_id = await asyncio.wait_for(self.task_queue.get(), timeout=1.0)
                
                if task_id in self.tasks:
                    await self._execute_task(task_id)
                    
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error processing task queue: {str(e)}")
    
    async def _execute_task(self, task_id: str):
        """Execute a single music generation task"""
        task = self.tasks[task_id]
        
        try:
            task.status = MusicTaskStatus.PROCESSING
            task.updated_at = datetime.utcnow()
            
            logger.info(f"Executing music generation task: {task_id}")
            
            # Execute the music generation
            result = await self.music_service.generate_music(task.request)
            
            if result.success:
                task.result = result
                task.status = MusicTaskStatus.COMPLETED
                logger.info(f"Completed music generation task: {task_id}")
            else:
                # Handle retry logic
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.status = MusicTaskStatus.RETRYING
                    task.updated_at = datetime.utcnow()
                    logger.warning(f"Retrying task {task_id} (attempt {task.retry_count})")
                    
                    # Schedule retry
                    await asyncio.sleep(2 ** task.retry_count)  # Exponential backoff
                    await self.task_queue.put(task_id)
                else:
                    task.status = MusicTaskStatus.FAILED
                    task.result = result
                    logger.error(f"Failed music generation task: {task_id} - {result.error}")
            
            task.updated_at = datetime.utcnow()
            
        except Exception as e:
            logger.error(f"Error executing task {task_id}: {str(e)}")
            
            # Handle retry logic for exceptions
            if task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = MusicTaskStatus.RETRYING
                task.updated_at = datetime.utcnow()
                
                # Schedule retry
                await asyncio.sleep(2 ** task.retry_count)  # Exponential backoff
                await self.task_queue.put(task_id)
            else:
                task.status = MusicTaskStatus.FAILED
                task.updated_at = datetime.utcnow()

class MusicAnalytics:
    """Analytics and monitoring for music generation services"""
    
    def __init__(self):
        self.generation_stats = {
            'total_generations': 0,
            'successful_generations': 0,
            'failed_generations': 0,
            'provider_stats': {}
        }
        self.start_time = datetime.utcnow()
    
    def record_generation(self, provider: MusicProvider, success: bool):
        """Record a generation event"""
        self.generation_stats['total_generations'] += 1
        
        if success:
            self.generation_stats['successful_generations'] += 1
        else:
            self.generation_stats['failed_generations'] += 1
        
        # Update provider stats
        provider_name = provider.value
        if provider_name not in self.generation_stats['provider_stats']:
            self.generation_stats['provider_stats'][provider_name] = {
                'total': 0,
                'successful': 0,
                'failed': 0
            }
        
        self.generation_stats['provider_stats'][provider_name]['total'] += 1
        if success:
            self.generation_stats['provider_stats'][provider_name]['successful'] += 1
        else:
            self.generation_stats['provider_stats'][provider_name]['failed'] += 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics"""
        uptime = datetime.utcnow() - self.start_time
        
        return {
            'uptime_seconds': uptime.total_seconds(),
            'total_generations': self.generation_stats['total_generations'],
            'successful_generations': self.generation_stats['successful_generations'],
            'failed_generations': self.generation_stats['failed_generations'],
            'success_rate': (
                self.generation_stats['successful_generations'] / 
                self.generation_stats['total_generations']
            ) if self.generation_stats['total_generations'] > 0 else 0,
            'provider_stats': self.generation_stats['provider_stats'],
            'uptime_human': str(uptime).split('.')[0]  # Remove microseconds
        }

# Global instances
orchestrator = MusicOrchestrator()
analytics = MusicAnalytics()

# FastAPI integration functions
def create_music_orchestration_routes():
    """Create FastAPI routes for music orchestration"""
    from fastapi import APIRouter, HTTPException, BackgroundTasks
    from fastapi.responses import JSONResponse
    
    router = APIRouter()
    
    @router.post("/music/orchestrate")
    async def orchestrate_music(request: MusicGenerationRequest):
        """Orchestrate music generation using multiple providers"""
        try:
            task_id = await orchestrator.generate_music(request)
            
            return {
                "task_id": task_id,
                "status": "queued",
                "message": "Music generation task created and queued"
            }
            
        except Exception as e:
            logger.error(f"Error orchestrating music generation: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.get("/music/tasks/{task_id}")
    async def get_task_status(task_id: str):
        """Get the status of a music generation task"""
        task = await orchestrator.get_task_status(task_id)
        
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        return {
            "task_id": task_id,
            "status": task.status.value,
            "created_at": task.created_at.isoformat(),
            "updated_at": task.updated_at.isoformat(),
            "retry_count": task.retry_count,
            "request": {
                "prompt": task.request.prompt,
                "duration": task.request.duration,
                "genre": task.request.genre,
                "provider": task.request.provider.value
            }
        }
    
    @router.get("/music/tasks/{task_id}/result")
    async def get_task_result(task_id: str):
        """Get the result of a completed music generation task"""
        result = await orchestrator.get_task_result(task_id)
        
        if not result:
            task = await orchestrator.get_task_status(task_id)
            if task and task.status == MusicTaskStatus.COMPLETED:
                raise HTTPException(status_code=404, detail="Result not available")
            else:
                raise HTTPException(status_code=404, detail="Task not completed or not found")
        
        return {
            "task_id": task_id,
            "success": result.success,
            "audio_url": result.audio_url,
            "metadata": result.metadata,
            "provider": result.provider.value if result.provider else None,
            "error": result.error
        }
    
    @router.delete("/music/tasks/{task_id}")
    async def cancel_task(task_id: str):
        """Cancel a music generation task"""
        success = await orchestrator.cancel_task(task_id)
        
        if success:
            return {"message": f"Task {task_id} cancelled successfully"}
        else:
            raise HTTPException(status_code=400, detail="Cannot cancel task")
    
    @router.get("/music/analytics")
    async def get_music_analytics():
        """Get music generation analytics"""
        return analytics.get_stats()
    
    @router.get("/music/providers")
    async def get_music_providers():
        """Get available music providers with status"""
        providers_info = []
        
        for provider in MusicProvider:
            providers_info.append({
                "name": provider.value,
                "description": provider.name,
                "commercial_use": get_provider_commercial_use(provider),
                "available": True  # Add actual availability checking here
            })
        
        return {"providers": providers_info}
    
    @router.post("/music/test/{provider_name}")
    async def test_provider(provider_name: str, request: MusicGenerationRequest):
        """Test a specific music provider"""
        try:
            provider = MusicProvider(provider_name.lower())
            result = await orchestrator.music_service.generate_music(request)
            
            # Record analytics
            analytics.record_generation(provider, result.success)
            
            return {
                "provider": provider_name,
                "test_result": result.success,
                "message": "Provider test completed",
                "error": result.error if not result.success else None
            }
            
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid provider: {provider_name}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
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

# Initialize orchestrator on startup
async def initialize_music_orchestrator():
    """Initialize the music orchestrator"""
    await orchestrator.initialize()

# Cleanup on shutdown
async def cleanup_music_orchestrator():
    """Cleanup the music orchestrator"""
    await orchestrator.shutdown()