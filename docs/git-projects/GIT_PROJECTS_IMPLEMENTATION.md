# Git-Native Projects Implementation Guide

## Quick Start

### 1. Install Dependencies

```bash
cd ~/beehive-studio/services/git-projects
pip install -r requirements.txt
```

### 2. Start the Service

```bash
cd ~/beehive-studio/services/git-projects
python main.py
```

### 3. Create Your First Project

```bash
curl -X POST http://localhost:9876/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "name": "my-first-ai-project",
    "description": "AI-powered music generation",
    "visibility": "private",
    "ai_capabilities": ["composition", "arrangement"]
  }'
```

## Core Implementation

### Project Service (`services/git-projects/api/project_service.py`)

```python
from typing import List, Optional
import git
import json
from datetime import datetime
import hashlib
import os

class ProjectService:
    def __init__(self, storage_path: str = "/tmp/beehive-projects"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
    
    def create_project(self, project_data: dict) -> dict:
        """Create a new git-based project"""
        project_id = self._generate_project_id(project_data["name"])
        
        # Create project directory
        project_path = os.path.join(self.storage_path, project_id)
        os.makedirs(project_path, exist_ok=True)
        
        # Initialize git repository
        repo = git.Repo.init(project_path)
        
        # Create initial structure
        self._create_project_structure(project_path, project_data)
        
        # Create first commit
        repo.index.add(["*"])
        repo.index.commit("Initial project creation", author=self._get_system_author())
        
        return {
            "id": project_id,
            "name": project_data["name"],
            "repository_url": f"git://localhost:9876/projects/{project_id}.git",
            "created_at": datetime.utcnow().isoformat(),
            "status": "active"
        }
    
    def list_projects(self, filters: dict = None) -> List[dict]:
        """List all projects with optional filtering"""
        projects = []
        
        for project_id in os.listdir(self.storage_path):
            project_path = os.path.join(self.storage_path, project_id)
            if os.path.isdir(project_path):
                project_info = self._get_project_info(project_path)
                if self._matches_filters(project_info, filters):
                    projects.append(project_info)
        
        return projects
    
    def get_project(self, project_id: str) -> dict:
        """Get detailed project information"""
        project_path = os.path.join(self.storage_path, project_id)
        if not os.path.exists(project_path):
            raise ValueError(f"Project {project_id} not found")
        
        return self._get_project_info(project_path)
    
    def create_branch(self, project_id: str, branch_name: str, source: str = "main") -> dict:
        """Create a new branch"""
        project_path = os.path.join(self.storage_path, project_id)
        repo = git.Repo(project_path)
        
        # Create branch from source
        source_branch = repo.branches[source]
        repo.create_branch(branch_name, source_branch)
        
        return {
            "branch": branch_name,
            "source": source,
            "created_at": datetime.utcnow().isoformat()
        }
    
    def commit_changes(self, project_id: str, commit_data: dict) -> dict:
        """Make a commit with AI metadata"""
        project_path = os.path.join(self.storage_path, project_id)
        repo = git.Repo(project_path)
        
        # Stage files
        for file_data in commit_data.get("files", []):
            file_path = os.path.join(project_path, file_data["path"])
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "w") as f:
                # Decode base64 content
                import base64
                content = base64.b64decode(file_data["content"]).decode('utf-8')
                f.write(content)
            
            repo.index.add([file_data["path"]])
        
        # Commit with AI metadata
        commit_message = commit_data.get("message", "AI-generated changes")
        author = commit_data.get("author", self._get_system_author())
        
        # Store AI metadata
        if "ai_metadata" in commit_data:
            ai_metadata_file = os.path.join(project_path, ".ai-metadata", "commits")
            os.makedirs(ai_metadata_file, exist_ok=True)
            
            metadata_path = os.path.join(ai_metadata_file, repo.head.commit.hexsha + ".json")
            with open(metadata_path, "w") as f:
                json.dump(commit_data["ai_metadata"], f, indent=2)
        
        repo.index.commit(commit_message, author=author)
        
        return {
            "commit_hash": repo.head.commit.hexsha,
            "message": commit_message,
            "author": author,
            "timestamp": repo.head.commit.committed_datetime.isoformat()
        }
```

### AI Integration Service (`services/git-projects/ai/integration_service.py`)

```python
import openai
from typing import List, Dict, Optional
import json
import re

class AIIntegrationService:
    def __init__(self, model: str = "gpt-4"):
        self.model = model
        self.client = openai.OpenAI()
    
    def generate_commit_message(self, diff: str, context: dict = None) -> str:
        """Generate appropriate commit message based on changes"""
        prompt = f"""
        Generate a commit message for the following git diff:
        
        {diff}
        
        Context: {context or 'No additional context'}
        
        Guidelines:
        - Be specific about what was changed
        - Include relevant AI context if applicable
        - Keep it under 72 characters
        - Use imperative mood
        
        Commit message:
        """
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100
        )
        
        return response.choices[0].message.content.strip()
    
    def review_code(self, file_path: str, code: str, focus_areas: List[str] = None) -> Dict:
        """AI-powered code review"""
        prompt = f"""
        Review the following code and provide feedback:
        
        File: {file_path}
        Code:
        ```{code}
        ```
        
        Focus areas: {focus_areas or ['quality', 'performance', 'style']}
        
        Provide:
        1. Overall quality score (1-10)
        2. Specific issues found
        3. Improvement suggestions
        4. Maintainability assessment
        """
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        
        return self._parse_review_response(response.choices[0].message.content)
    
    def suggest_refactoring(self, code: str, context: str = "") -> List[Dict]:
        """Suggest refactoring opportunities"""
        prompt = f"""
        Analyze the following code and suggest refactoring opportunities:
        
        Context: {context}
        Code:
        ```{code}
        ```
        
        Look for:
        - Code duplication
        - Long functions/methods
        - Complex conditional logic
        - Performance issues
        - Style violations
        
        Provide specific suggestions with estimated impact.
        """
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400
        )
        
        return self._parse_refactoring_suggestions(response.choices[0].message.content)
    
    def generate_documentation(self, code: str, file_path: str, format: str = "markdown") -> str:
        """Generate documentation for code"""
        prompt = f"""
        Generate {format} documentation for the following code:
        
        File: {file_path}
        Code:
        ```{code}
        ```
        
        Include:
        - Purpose and description
        - Key functions/classes
        - Usage examples
        - Important considerations
        """
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000
        )
        
        return response.choices[0].message.content.strip()
    
    def _parse_review_response(self, response: str) -> Dict:
        """Parse AI review response into structured format"""
        # Implementation depends on AI response format
        return {
            "score": 8.5,
            "issues": [],
            "suggestions": [],
            "maintainability": "good"
        }
    
    def _parse_refactoring_suggestions(self, response: str) -> List[Dict]:
        """Parse refactoring suggestions"""
        # Implementation depends on AI response format
        return []
```

### WebSocket Collaboration Handler (`services/git-projects/websocket/handler.py`)

```python
import asyncio
import json
import websockets
from typing import Dict, Set
import uuid

class CollaborationHandler:
    def __init__(self):
        self.active_connections: Set[websockets.WebSocketServerProtocol] = set()
        self.project_rooms: Dict[str, Set[websockets.WebSocketServerProtocol]] = {}
        self.user_cursors: Dict[str, Dict] = {}
    
    async def connect(self, websocket: websockets.WebSocketServerProtocol, project_id: str):
        """Handle new WebSocket connection"""
        self.active_connections.add(websocket)
        
        if project_id not in self.project_rooms:
            self.project_rooms[project_id] = set()
        
        self.project_rooms[project_id].add(websocket)
        
        # Send welcome message
        await websocket.send(json.dumps({
            "type": "connected",
            "project_id": project_id,
            "connection_id": str(uuid.uuid4())
        }))
    
    async def disconnect(self, websocket: websockets.WebSocketServerProtocol, project_id: str):
        """Handle WebSocket disconnection"""
        self.active_connections.discard(websocket)
        
        if project_id in self.project_rooms:
            self.project_rooms[project_id].discard(websocket)
            
            if not self.project_rooms[project_id]:
                del self.project_rooms[project_id]
    
    async def handle_message(self, websocket: websockets.WebSocketServerProtocol, project_id: str, message: str):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "cursor_update":
                await self._handle_cursor_update(websocket, project_id, data)
            elif msg_type == "file_edit":
                await self._handle_file_edit(websocket, project_id, data)
            elif msg_type == "selection":
                await self._handle_selection(websocket, project_id, data)
            
        except json.JSONDecodeError:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON format"
            }))
    
    async def _handle_cursor_update(self, websocket: websockets.WebSocketServerProtocol, project_id: str, data: Dict):
        """Handle cursor position updates"""
        user_id = data.get("user_id")
        cursor_pos = data.get("position")
        
        self.user_cursors[user_id] = {
            "project_id": project_id,
            "position": cursor_pos,
            "timestamp": asyncio.get_event_loop().time()
        }
        
        # Broadcast to other users in the same project
        await self._broadcast_to_project(project_id, {
            "type": "cursor_update",
            "user_id": user_id,
            "position": cursor_pos
        }, exclude=websocket)
    
    async def _handle_file_edit(self, websocket: websockets.WebSocketServerProtocol, project_id: str, data: Dict):
        """Handle file editing operations"""
        edit_data = {
            "type": "file_edit",
            "user_id": data.get("user_id"),
            "file": data.get("file"),
            "operation": data.get("operation"),  # "insert" | "delete" | "replace"
            "content": data.get("content"),
            "position": data.get("position")
        }
        
        # Broadcast to other users
        await self._broadcast_to_project(project_id, edit_data, exclude=websocket)
    
    async def _broadcast_to_project(self, project_id: str, message: Dict, exclude=None):
        """Broadcast message to all users in a project"""
        if project_id in self.project_rooms:
            for websocket in self.project_rooms[project_id]:
                if websocket != exclude and websocket.open:
                    try:
                        await websocket.send(json.dumps(message))
                    except websockets.exceptions.ConnectionClosed:
                        pass
```

## Deployment Configuration

### Docker Compose (`services/git-projects/docker-compose.yml`)

```yaml
version: '3.8'
services:
  git-projects-api:
    build: .
    ports:
      - "9876:9876"
    environment:
      - STORAGE_PATH=/data/projects
      - REDIS_URL=redis://redis:6379
      - AI_MODEL=gpt-4
    volumes:
      - project_data:/data/projects
    depends_on:
      - redis
      - ai-service
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
  
  ai-service:
    image: beehive-ai-service:latest
    ports:
      - "8001:8001"
    environment:
      - MODEL=gpt-4
      - API_KEY=${AI_API_KEY}

volumes:
  project_data:
  redis_data:
```

### Environment Configuration (`.env`)

```bash
# Git Projects Service
PORT=9876
STORAGE_PATH=/data/projects
REDIS_URL=redis://localhost:6379

# AI Configuration
AI_MODEL=gpt-4
AI_API_KEY=your-api-key-here

# Security
JWT_SECRET=your-jwt-secret
RATE_LIMIT_REQUESTS=100
```

## Monitoring and Observability

### Health Check Endpoint

```http
GET /api/projects/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": "2d 14h 32m",
  "storage": {
    "total_projects": 42,
    "total_size": "2.5GB",
    "available_space": "15GB"
  },
  "ai_service": {
    "status": "available",
    "model": "gpt-4",
    "response_time": "1.2s"
  },
  "collaboration": {
    "active_sessions": 12,
    "active_projects": 5
  }
}
```

### Metrics Collection

The service collects metrics for:
- Project creation and management
- Git operations count and latency
- AI operation success rates
- Collaboration session counts
- Storage usage patterns

Use Prometheus and Grafana for visualization and alerting.

## Best Practices

### 1. Project Organization

- Use consistent naming conventions
- Separate AI-generated content from user content
- Include `.ai-metadata` directory for AI-related information
- Use semantic versioning for project branches

### 2. AI Integration

- Always validate AI-generated code
- Keep AI models and prompts versioned
- Document AI decision-making process
- Monitor AI performance and accuracy

### 3. Collaboration

- Use cursors and selections for real-time feedback
- Implement conflict detection and resolution
- Store collaboration metadata in git
- Provide offline capabilities

### 4. Performance

- Cache frequently accessed project metadata
- Use efficient git operations
- Implement connection pooling for AI services
- Monitor memory usage for large projects

## Troubleshooting

### Common Issues

1. **Git Repository Corruption**
   - Use `git fsck` to check repository integrity
   - Regular backups of project data
   - Implement automatic recovery procedures

2. **AI Service Failures**
   - Fallback to simpler models
   - Implement retry logic with exponential backoff
   - Cache AI responses for common queries

3. **WebSocket Connection Issues**
   - Implement connection health checks
   - Automatic reconnection with exponential backoff
   - Graceful degradation to polling mode

### Debug Mode

Enable debug logging for troubleshooting:

```bash
export DEBUG=1
python main.py
```

Or set environment variable:
```bash
export LOG_LEVEL=DEBUG
```