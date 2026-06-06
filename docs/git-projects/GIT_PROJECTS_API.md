# Git-Native Projects API Specification

## Overview

The Git-Native Projects API provides a RESTful interface for managing collaborative, version-controlled AI projects. Each project is a git repository enhanced with AI capabilities and collaboration features.

## Base URL

```
http://localhost:9876/api/projects
```

## Authentication

All endpoints require authentication via Bearer token or session cookie.

## Project Management Endpoints

### Create Project

```http
POST /api/projects
```

**Request Body:**
```json
{
  "name": "my-ai-project",
  "description": "AI-powered music generation project",
  "visibility": "private|public",
  "ai_capabilities": ["composition", "arrangement", "mixing"],
  "initial_template": "empty|basic|advanced"
}
```

**Response:**
```json
{
  "id": "proj_123456789",
  "name": "my-ai-project",
  "repository_url": "git://localhost:9876/projects/my-ai-project.git",
  "created_at": "2026-06-06T12:00:00Z",
  "collaborators": ["user1", "user2"],
  "status": "active"
}
```

### List Projects

```http
GET /api/projects
```

**Query Parameters:**
- `limit`: Number of projects to return (default: 20)
- `offset`: Offset for pagination (default: 0)
- `visibility`: Filter by visibility (private|public|all)
- `ai_capabilities`: Filter by AI capabilities

**Response:**
```json
{
  "projects": [
    {
      "id": "proj_123456789",
      "name": "my-ai-project",
      "description": "AI-powered music generation",
      "visibility": "private",
      "created_at": "2026-06-06T12:00:00Z",
      "last_commit": "2026-06-06T11:30:00Z",
      "ai_capabilities": ["composition", "arrangement"],
      "collaborators_count": 2
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Get Project Details

```http
GET /api/projects/{projectId}
```

**Response:**
```json
{
  "id": "proj_123456789",
  "name": "my-ai-project",
  "description": "AI-powered music generation project",
  "visibility": "private",
  "created_at": "2026-06-06T12:00:00Z",
  "updated_at": "2026-06-06T15:30:00Z",
  "repository_url": "git://localhost:9876/projects/my-ai-project.git",
  "clone_url": "git://localhost:9876/projects/my-ai-project.git",
  "ai_capabilities": ["composition", "arrangement", "mixing"],
  "collaborators": [
    {
      "id": "user1",
      "name": "User One",
      "role": "owner",
      "permissions": ["read", "write", "admin"]
    }
  ],
  "branches": ["main", "feature/experimental"],
  "tags": ["v1.0.0", "v0.9.0"],
  "commit_count": 42,
  "size": 2.5,
  "status": "active"
}
```

### Update Project

```http
PUT /api/projects/{projectId}
```

**Request Body:**
```json
{
  "name": "updated-project-name",
  "description": "Updated description",
  "visibility": "public",
  "ai_capabilities": ["composition", "arrangement", "mixing", "mastering"]
}
```

### Delete Project

```http
DELETE /api/projects/{projectId}
```

## Git Operations Endpoints

### Clone Project

```http
POST /api/projects/{projectId}/clone
```

**Request Body:**
```json
{
  "target_path": "/path/to/local/clone",
  "branch": "main",
  "recursive": true
}
```

### Fetch Updates

```http
POST /api/projects/{projectId}/fetch
```

**Request Body:**
```json
{
  "remote": "origin",
  "branch": "main",
  "prune": true
}
```

### Commit Changes

```http
POST /api/projects/{projectId}/commit
```

**Request Body:**
```json
{
  "message": "AI: Generated new composition",
  "author": {
    "name": "AI Agent",
    "email": "ai@beehive.studio"
  },
  "files": [
    {
      "path": "compositions/track1.json",
      "content": "base64-encoded-content"
    }
  ],
  "ai_metadata": {
    "model": "gpt-4",
    "prompt": "Generate a jazz composition",
    "confidence": 0.95
  }
}
```

### Merge Branch

```http
POST /api/projects/{projectId}/merge
```

**Request Body:**
```json
{
  "source": "feature/experimental",
  "target": "main",
  "commit_message": "Merge experimental AI feature",
  "strategy": "merge|rebase|squash",
  "ai_assisted": true
}
```

### Create Branch

```http
POST /api/projects/{projectId}/branches
```

**Request Body:**
```json
{
  "name": "ai-generated-variation",
  "source": "main",
  "description": "AI-generated variation of current composition"
}
```

## AI-Enhanced Operations

### AI Code Review

```http
POST /api/projects/{projectId}/ai/review
```

**Request Body:**
```json
{
  "target": "main",
  "scope": "diff|file|project",
  "focus": ["quality", "performance", "style"],
  "context": {
    "previous_review": "commit_hash",
    "ai_model": "code-review-v2"
  }
}
```

**Response:**
```json
{
  "review_id": "rev_123456789",
  "findings": [
    {
      "file": "compositions/track1.json",
      "line": 42,
      "severity": "warning",
      "message": "AI suggests optimizing this composition pattern",
      "suggestion": "Consider using a different chord progression",
      "confidence": 0.87
    }
  ],
  "summary": {
    "total_findings": 5,
    "critical": 0,
    "warnings": 3,
    "suggestions": 2
  },
  "ai_insights": {
    "quality_score": 8.5,
    "performance_score": 9.2,
    "style_consistency": 7.8
  }
}
```

### AI Refactoring Suggestion

```http
POST /api/projects/{projectId}/ai/refactor
```

**Request Body:**
```json
{
  "target": "compositions/",
  "pattern": "duplicate_code|complex_function|long_file",
  "priority": "high|medium|low",
  "constraints": {
    "preserve_functionality": true,
    "maintain_api": false
  }
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "file": "compositions/track1.json",
      "current_code": "...",
      "suggested_code": "...",
      "benefits": ["Reduces complexity", "Improves readability"],
      "estimated_improvement": 0.15,
      "risk_level": "low"
    }
  ]
}
```

### AI Documentation Generation

```http
POST /api/projects/{projectId}/ai/docs
```

**Request Body:**
```json
{
  "target": "project|specific_file",
  "format": "markdown|html|json",
  "focus": ["api", "architecture", "usage"],
  "include_examples": true,
  "ai_model": "doc-generator-v1"
}
```

## Collaboration Endpoints

### Add Collaborator

```http
POST /api/projects/{projectId}/collaborators
```

**Request Body:**
```json
{
  "user_id": "user123",
  "role": "collaborator|admin|viewer",
  "permissions": {
    "read": true,
    "write": true,
    "delete": false
  }
}
```

### Real-time Collaboration

```http
WebSocket ws://localhost:9876/api/projects/{projectId}/collaborate
```

**Messages:**
```json
{
  "type": "cursor_update|file_edit|selection",
  "user": "user123",
  "data": {
    "file": "compositions/track1.json",
    "position": {"line": 10, "column": 5},
    "content": "new content"
  }
}
```

## Performance Analytics

### Project Metrics

```http
GET /api/projects/{projectId}/analytics
```

**Response:**
```json
{
  "commits": {
    "total": 42,
    "daily_average": 2.1,
    "authors": ["user1", "ai_agent"],
    "ai_generated": 15
  },
  "branches": {
    "total": 5,
    "active": 2,
    "merged": 3
  },
  "ai_operations": {
    "code_reviews": 8,
    "refactorings": 5,
    "documentation": 3
  },
  "performance": {
    "average_commit_time": 2.5,
    "merge_conflict_rate": 0.05,
    "ai_assisted_success_rate": 0.92
  }
}
```

## Error Responses

All endpoints return appropriate HTTP status codes and error messages:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project with ID 'proj_123456789' not found",
    "details": {
      "suggestion": "Check the project ID or create a new project"
    }
  }
}
```

## Rate Limiting

- **API**: 100 requests per minute per user
- **Git Operations**: 50 requests per minute per user
- **AI Operations**: 20 requests per minute per user

## Webhooks

Projects can emit webhook events for external integrations:

```json
{
  "event": "project.created|project.updated|commit.push|branch.created|ai.review.completed",
  "project_id": "proj_123456789",
  "timestamp": "2026-06-06T12:00:00Z",
  "data": { ... }
}
```