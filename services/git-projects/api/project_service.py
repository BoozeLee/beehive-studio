"""Git-Native Projects Service"""
import os
import json
import uuid
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Any
import asyncio
import aiofiles
import git
from pathlib import Path

from fastapi import HTTPException, status
from pydantic import BaseModel, Field


class ProjectData(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., max_length=500)
    visibility: str = Field(default="private", regex="^(private|public)$")
    ai_capabilities: List[str] = Field(default_factory=list)
    initial_template: str = Field(default="empty", regex="^(empty|basic|advanced)$")


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    visibility: str
    repository_url: str
    created_at: str
    updated_at: str
    status: str
    ai_capabilities: List[str]
    collaborators: List[str]
    commit_count: int
    size_mb: float


class ProjectService:
    def __init__(self, storage_path: str = "/tmp/beehive-projects"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Initialize git repositories directory
        self.repos_path = self.storage_path / "repositories"
        self.repos_path.mkdir(exist_ok=True)
        
        # AI metadata directory
        self.metadata_path = self.storage_path / "ai-metadata"
        self.metadata_path.mkdir(exist_ok=True)
        
        # In-memory cache for performance
        self._project_cache: Dict[str, ProjectResponse] = {}
        self._cache_ttl = 300  # 5 minutes
    
    def _generate_project_id(self, name: str) -> str:
        """Generate unique project ID from name"""
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        slug = name.lower().replace(" ", "-").replace("_", "-")
        clean_slug = "".join(c for c in slug if c.isalnum() or c == "-")
        return f"proj-{clean_slug}-{timestamp}"
    
    def _get_system_author(self) -> git.Actor:
        """Get system git author"""
        return git.Actor("Beehive Studio AI", "ai@beehive.studio")
    
    def _create_project_structure(self, project_path: Path, template: str = "empty"):
        """Create initial project structure based on template"""
        structure = {
            "empty": {
                "README.md": "# Project: {name}\n\n{description}",
                ".gitignore": "*.pyc\n__pycache__/\n.env\n.venv/\n",
                "project.json": json.dumps({
                    "name": "{{name}}",
                    "description": "{{description}}",
                    "created_at": datetime.utcnow().isoformat(),
                    "ai_capabilities": []
                }, indent=2)
            },
            "basic": {
                **{
                    "README.md": "# {name}\n\n{description}\n\n## Getting Started\n\nThis is a basic Beehive Studio project with AI capabilities.",
                    ".gitignore": "*.pyc\n__pycache__/\n.env\n.venv/\nnode_modules/\n",
                    "project.json": json.dumps({
                        "name": "{{name}}",
                        "description": "{{description}}",
                        "created_at": datetime.utcnow().isoformat(),
                        "ai_capabilities": ["composition", "arrangement"],
                        "structure": {
                            "compositions/": "AI-generated compositions",
                            "arrangements/": "Musical arrangements",
                            "samples/": "Audio samples",
                            "settings/": "Project settings"
                        }
                    }, indent=2)
                },
                "compositions/": "",
                "arrangements/": "",
                "samples/": "",
                "settings/": ""
            },
            "advanced": {
                **{
                    "README.md": "# {name}\n\n{description}\n\n## Advanced Features\n\n- AI-powered composition\n- Collaborative editing\n- Version control integration\n- Performance analytics",
                    ".gitignore": "*.pyc\n__pycache__/\n.env\n.venv/\nnode_modules/\n*.log\n.DS_Store\n",
                    "project.json": json.dumps({
                        "name": "{{name}}",
                        "description": "{{description}}",
                        "created_at": datetime.utcnow().isoformat(),
                        "ai_capabilities": ["composition", "arrangement", "mixing", "mastering"],
                        "structure": {
                            "compositions/": "AI-generated compositions",
                            "arrangements/": "Musical arrangements",
                            "samples/": "Audio samples",
                            "settings/": "Project settings",
                            "collaboration/": "Collaboration data",
                            "analytics/": "Performance analytics",
                            "models/": "AI models and weights",
                            "exports/": "Final exports"
                        },
                        "collaboration": {
                            "enabled": True,
                            "real_time": True,
                            "ai_assisted": True
                        }
                    }, indent=2),
                    ".beehive/config.json": json.dumps({
                        "version": "1.0.0",
                        "ai": {
                            "model": "gpt-4",
                            "temperature": 0.7,
                            "max_tokens": 2048
                        },
                        "audio": {
                            "sample_rate": 44100,
                            "bit_depth": 24,
                            "channels": 2
                        },
                        "collaboration": {
                            "enabled": True,
                            "max_concurrent_users": 10
                        }
                    }, indent=2)
                },
                "compositions/": "",
                "arrangements/": "",
                "samples/": "",
                "settings/": "",
                "collaboration/": "",
                "analytics/": "",
                "models/": "",
                "exports/": ""
            }
        }
        
        files_to_create = structure.get(template, structure["empty"])
        
        for path, content in files_to_create.items():
            file_path = project_path / path
            
            if path.endswith("/"):
                # Create directory
                file_path.mkdir(parents=True, exist_ok=True)
            else:
                # Create file with template substitution
                if isinstance(content, str) and ("{{name}}" in content or "{{description}}" in content):
                    content = content.replace("{{name}}", template.get("name", "Project"))
                    content = content.replace("{{description}}", template.get("description", ""))
                
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content)
    
    async def create_project(self, project_data: ProjectData, creator_id: str = "system") -> ProjectResponse:
        """Create a new git-based project"""
        project_id = self._generate_project_id(project_data.name)
        
        # Create project directory
        project_path = self.repos_path / project_id
        project_path.mkdir(parents=True, exist_ok=True)
        
        try:
            # Initialize git repository
            repo = git.Repo.init(project_path)
            
            # Create initial structure
            self._create_project_structure(project_path, project_data.initial_template)
            
            # Create first commit
            repo.index.add(["*"])
            commit_message = f"Initial project creation: {project_data.name}"
            repo.index.commit(commit_message, author=self._get_system_author())
            
            # Create project metadata
            project_metadata = {
                "id": project_id,
                "name": project_data.name,
                "description": project_data.description,
                "visibility": project_data.visibility,
                "ai_capabilities": project_data.ai_capabilities,
                "creator": creator_id,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "status": "active",
                "repository_url": f"git://localhost:9876/projects/{project_id}.git",
                "clone_url": f"git://localhost:9876/projects/{project_id}.git",
                "branches": ["main"],
                "tags": [],
                "commit_count": 1,
                "size_mb": self._get_project_size(project_path)
            }
            
            # Save project metadata
            metadata_file = self.metadata_path / f"{project_id}.json"
            metadata_file.write_text(json.dumps(project_metadata, indent=2))
            
            # Cache the project
            project_response = ProjectResponse(**project_metadata)
            self._project_cache[project_id] = project_response
            
            return project_response
            
        except Exception as e:
            # Cleanup on failure
            if project_path.exists():
                import shutil
                shutil.rmtree(project_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create project: {str(e)}"
            )
    
    async def list_projects(self, 
                          visibility: str = "all",
                          ai_capabilities: List[str] = None,
                          limit: int = 20,
                          offset: int = 0) -> Dict[str, Any]:
        """List all projects with filtering"""
        projects = []
        
        # Scan for project metadata files
        for metadata_file in self.metadata_path.glob("*.json"):
            try:
                metadata = json.loads(metadata_file.read_text())
                
                # Apply filters
                if visibility != "all" and metadata.get("visibility") != visibility:
                    continue
                
                if ai_capabilities:
                    project_caps = metadata.get("ai_capabilities", [])
                    if not any(cap in project_caps for cap in ai_capabilities):
                        continue
                
                projects.append(metadata)
                
            except Exception as e:
                print(f"Error reading project metadata {metadata_file}: {e}")
                continue
        
        # Sort by creation date (newest first)
        projects.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        # Apply pagination
        total = len(projects)
        projects = projects[offset:offset + limit]
        
        # Convert to response models
        project_responses = [ProjectResponse(**project) for project in projects]
        
        return {
            "projects": project_responses,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    
    async def get_project(self, project_id: str) -> ProjectResponse:
        """Get detailed project information"""
        # Check cache first
        if project_id in self._project_cache:
            cached_project = self._project_cache[project_id]
            # Check if cache is still valid
            if (datetime.utcnow() - datetime.fromisoformat(cached_project.created_at)).seconds < self._cache_ttl:
                return cached_project
        
        # Load from metadata
        metadata_file = self.metadata_path / f"{project_id}.json"
        if not metadata_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )
        
        try:
            metadata = json.loads(metadata_file.read_text())
            
            # Update latest stats
            project_path = self.repos_path / project_id
            if project_path.exists():
                try:
                    repo = git.Repo(project_path)
                    metadata["commit_count"] = len(repo.iter_commits())
                    metadata["size_mb"] = self._get_project_size(project_path)
                    metadata["updated_at"] = datetime.utcnow().isoformat()
                except Exception:
                    pass
            
            # Update cache
            project_response = ProjectResponse(**metadata)
            self._project_cache[project_id] = project_response
            
            return project_response
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to load project {project_id}: {str(e)}"
            )
    
    async def update_project(self, project_id: str, updates: Dict[str, Any]) -> ProjectResponse:
        """Update project information"""
        metadata_file = self.metadata_path / f"{project_id}.json"
        if not metadata_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )
        
        try:
            # Load existing metadata
            metadata = json.loads(metadata_file.read_text())
            
            # Apply updates
            for key, value in updates.items():
                if key in metadata:
                    metadata[key] = value
            
            # Update timestamps
            metadata["updated_at"] = datetime.utcnow().isoformat()
            
            # Save updated metadata
            metadata_file.write_text(json.dumps(metadata, indent=2))
            
            # Update cache
            project_response = ProjectResponse(**metadata)
            self._project_cache[project_id] = project_response
            
            return project_response
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update project {project_id}: {str(e)}"
            )
    
    async def delete_project(self, project_id: str) -> bool:
        """Delete a project"""
        metadata_file = self.metadata_path / f"{project_id}.json"
        project_path = self.repos_path / project_id
        
        try:
            # Delete metadata
            if metadata_file.exists():
                metadata_file.unlink()
            
            # Delete project repository
            if project_path.exists():
                import shutil
                shutil.rmtree(project_path)
            
            # Remove from cache
            self._project_cache.pop(project_id, None)
            
            return True
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete project {project_id}: {str(e)}"
            )
    
    async def create_branch(self, project_id: str, branch_name: str, source: str = "main") -> Dict[str, Any]:
        """Create a new branch"""
        project_path = self.repos_path / project_id
        if not project_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )
        
        try:
            repo = git.Repo(project_path)
            
            # Check if branch already exists
            if branch_name in repo.branches:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Branch {branch_name} already exists"
                )
            
            # Create branch from source
            source_branch = repo.branches[source]
            repo.create_branch(branch_name, source_branch)
            
            return {
                "branch": branch_name,
                "source": source,
                "created_at": datetime.utcnow().isoformat()
            }
            
        except git.GitCommandError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Git error: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create branch: {str(e)}"
            )
    
    async def commit_changes(self, project_id: str, commit_data: Dict[str, Any]) -> Dict[str, Any]:
        """Make a commit with AI metadata"""
        project_path = self.repos_path / project_id
        if not project_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found"
            )
        
        try:
            repo = git.Repo(project_path)
            
            # Stage files
            for file_data in commit_data.get("files", []):
                file_path = project_path / file_data["path"]
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Write file content (base64 decoded)
                import base64
                content = base64.b64decode(file_data["content"]).decode('utf-8')
                file_path.write_text(content)
                
                repo.index.add([file_data["path"]])
            
            # Commit with AI metadata
            commit_message = commit_data.get("message", "AI-generated changes")
            
            # Create git author
            author_name = commit_data.get("author", {}).get("name", "Beehive Studio AI")
            author_email = commit_data.get("author", {}).get("email", "ai@beehive.studio")
            author = git.Actor(author_name, author_email)
            
            # Make commit
            commit = repo.index.commit(commit_message, author=author)
            
            # Store AI metadata
            if "ai_metadata" in commit_data:
                ai_metadata_dir = project_path / ".ai-metadata" / "commits"
                ai_metadata_dir.mkdir(parents=True, exist_ok=True)
                
                metadata_file = ai_metadata_dir / f"{commit.hexsha}.json"
                metadata_file.write_text(json.dumps(commit_data["ai_metadata"], indent=2))
            
            return {
                "commit_hash": commit.hexsha,
                "message": commit_message,
                "author": {
                    "name": author.name,
                    "email": author.email
                },
                "timestamp": commit.committed_datetime.isoformat()
            }
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to commit changes: {str(e)}"
            )
    
    def _get_project_size(self, project_path: Path) -> float:
        """Get project size in MB"""
        total_size = 0
        try:
            for dirpath, dirnames, filenames in os.walk(project_path):
                for filename in filenames:
                    file_path = os.path.join(dirpath, filename)
                    total_size += os.path.getsize(file_path)
        except Exception:
            pass
        
        return round(total_size / (1024 * 1024), 2)  # Convert to MB