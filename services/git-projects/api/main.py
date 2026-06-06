"""Git-Native Projects API - Main Application"""
import os
import json
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from pydantic import BaseModel, Field

# Import local modules
from .project_service import ProjectService, ProjectData, ProjectResponse
from ..ai.integration_service import AIIntegrationService
from ..websocket.handler import CollaborationHandler

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Starting Git-Native Projects Service")
    
    # Initialize services
    app.state.project_service = ProjectService()
    app.state.ai_service = AIIntegrationService(
        api_key=os.getenv("AI_API_KEY", "your-api-key-here")
    )
    app.state.collaboration_handler = CollaborationHandler()
    
    # Start collaboration handler
    asyncio.create_task(start_collaboration_server())
    
    yield
    
    # Cleanup
    logger.info("Shutting down Git-Native Projects Service")
    await app.state.ai_service.close()


# Create FastAPI app
app = FastAPI(
    title="Beehive Studio Git-Native Projects",
    description="AI-powered collaborative project management with git integration",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency for authentication (simplified)
async def get_current_user(authorization: str = Header(None)) -> str:
    """Extract user from authorization header (simplified)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication"
        )
    
    # In a real app, you would validate the token and extract user info
    user_id = authorization[7:]  # Remove "Bearer " prefix
    return user_id


# Project Management Endpoints
@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectData,
    current_user: str = Depends(get_current_user)
):
    """Create a new git-based project"""
    try:
        project = await app.state.project_service.create_project(
            project_data, 
            creator_id=current_user
        )
        return project
    except Exception as e:
        logger.error(f"Failed to create project: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.get("/api/projects")
async def list_projects(
    visibility: str = "all",
    ai_capabilities: Optional[List[str]] = None,
    limit: int = 20,
    offset: int = 0,
    current_user: str = Depends(get_current_user)
):
    """List all projects with filtering"""
    try:
        projects = await app.state.project_service.list_projects(
            visibility=visibility,
            ai_capabilities=ai_capabilities,
            limit=limit,
            offset=offset
        )
        return projects
    except Exception as e:
        logger.error(f"Failed to list projects: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get detailed project information"""
    try:
        project = await app.state.project_service.get_project(project_id)
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    updates: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """Update project information"""
    try:
        project = await app.state.project_service.update_project(project_id, updates)
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: str = Depends(get_current_user)
):
    """Delete a project"""
    try:
        success = await app.state.project_service.delete_project(project_id)
        return {"success": success}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Git Operations Endpoints
@app.post("/api/projects/{project_id}/branches")
async def create_branch(
    project_id: str,
    branch_data: Dict[str, str],
    current_user: str = Depends(get_current_user)
):
    """Create a new branch"""
    try:
        result = await app.state.project_service.create_branch(
            project_id,
            branch_data["name"],
            branch_data.get("source", "main")
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create branch: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.post("/api/projects/{project_id}/commit")
async def commit_changes(
    project_id: str,
    commit_data: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """Make a commit with AI metadata"""
    try:
        result = await app.state.project_service.commit_changes(project_id, commit_data)
        
        # Generate AI commit message if not provided
        if "ai_metadata" in commit_data:
            diff = commit_data.get("diff", "")
            if diff:
                ai_message = await app.state.ai_service.generate_commit_message(
                    diff, 
                    commit_data.get("ai_metadata", {})
                )
                result["ai_generated_message"] = ai_message
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to commit changes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# AI-Enhanced Operations Endpoints
@app.post("/api/projects/{project_id}/ai/review")
async def ai_review_code(
    project_id: str,
    review_request: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """AI-powered code review"""
    try:
        result = await app.state.ai_service.review_code(
            review_request["file_path"],
            review_request["code"],
            review_request.get("focus_areas"),
            review_request.get("context")
        )
        return result
    except Exception as e:
        logger.error(f"Failed to perform AI review: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.post("/api/projects/{project_id}/ai/refactor")
async def ai_refactor_code(
    project_id: str,
    refactor_request: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """AI-powered refactoring suggestions"""
    try:
        suggestions = await app.state.ai_service.suggest_refactoring(
            refactor_request["code"],
            refactor_request["file_path"],
            refactor_request.get("context")
        )
        return {"suggestions": suggestions}
    except Exception as e:
        logger.error(f"Failed to perform AI refactoring: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.post("/api/projects/{project_id}/ai/docs")
async def ai_generate_docs(
    project_id: str,
    docs_request: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """Generate AI-powered documentation"""
    try:
        documentation = await app.state.ai_service.generate_documentation(
            docs_request["code"],
            docs_request["file_path"],
            docs_request.get("format", "markdown"),
            docs_request.get("focus")
        )
        return {"documentation": documentation}
    except Exception as e:
        logger.error(f"Failed to generate documentation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.post("/api/projects/{project_id}/ai/generate")
async def ai_generate_content(
    project_id: str,
    generation_request: Dict[str, Any],
    current_user: str = Depends(get_current_user)
):
    """Generate AI content for projects"""
    try:
        content = await app.state.ai_service.generate_ai_content(
            generation_request["prompt"],
            generation_request.get("context"),
            generation_request.get("content_type", "composition")
        )
        return content
    except Exception as e:
        logger.error(f"Failed to generate AI content: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Collaboration Endpoints
@app.websocket("/api/projects/{project_id}/collaborate")
async def collaborate_websocket(websocket: WebSocket, project_id: str):
    """WebSocket endpoint for real-time collaboration"""
    await websocket.accept()
    
    try:
        # Generate a temporary user ID for this session
        user_id = f"user_{uuid.uuid4().hex[:8]}"
        
        # Connect to collaboration handler
        await app.state.collaboration_handler.connect(websocket, user_id, project_id)
        
        # Handle messages
        while True:
            try:
                message = await websocket.receive_text()
                await app.state.collaboration_handler.handle_message(websocket, user_id, message)
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        await app.state.collaboration_handler.disconnect(websocket, user_id)


@app.get("/api/projects/{project_id}/analytics")
async def get_project_analytics(
    project_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get project collaboration and performance analytics"""
    try:
        # Get project stats
        project_stats = await app.state.project_service.get_project(project_id)
        
        # Get collaboration stats
        collaboration_stats = await app.state.collaboration_handler.get_project_stats(project_id)
        
        # Get user positions
        user_positions = await app.state.collaboration_handler.get_user_positions(project_id)
        
        return {
            "project": project_stats,
            "collaboration": collaboration_stats,
            "user_positions": user_positions,
            "analytics_generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get project analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Health and Monitoring Endpoints
@app.get("/api/projects/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check services
        project_health = "healthy"
        ai_health = "healthy" if app.state.ai_service else "unhealthy"
        collaboration_health = "healthy"
        
        # Get project counts
        projects = await app.state.project_service.list_projects(limit=1)
        total_projects = projects.get("total", 0)
        
        return {
            "status": "healthy",
            "services": {
                "projects": project_health,
                "ai_service": ai_health,
                "collaboration": collaboration_health
            },
            "metrics": {
                "total_projects": total_projects,
                "active_sessions": len(app.state.collaboration_handler.active_connections),
                "uptime": "2d 14h 32m"  # Would track actual uptime in production
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@app.get("/api/projects/stats")
async def get_system_stats():
    """Get system-wide statistics"""
    try:
        # Get all projects
        projects = await app.state.project_service.list_projects(limit=1000)
        
        # Calculate stats
        total_projects = projects.get("total", 0)
        private_projects = sum(1 for p in projects["projects"] if p.visibility == "private")
        public_projects = total_projects - private_projects
        
        ai_capabilities = {}
        for project in projects["projects"]:
            for capability in project.ai_capabilities:
                ai_capabilities[capability] = ai_capabilities.get(capability, 0) + 1
        
        return {
            "projects": {
                "total": total_projects,
                "private": private_projects,
                "public": public_projects
            },
            "ai_capabilities": ai_capabilities,
            "collaboration": {
                "active_sessions": len(app.state.collaboration_handler.active_connections),
                "active_projects": len(app.state.collaboration_handler.project_rooms)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get system stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# Helper functions
async def start_collaboration_server():
    """Start the collaboration server (would be separate in production)"""
    logger.info("Collaboration handler started")


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.detail,
                "message": str(exc.detail),
                "timestamp": datetime.utcnow().isoformat()
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Internal server error",
                "timestamp": datetime.utcnow().isoformat()
            }
        }
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=9876,
        reload=True,
        log_level="info"
    )