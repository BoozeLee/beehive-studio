"""AI Integration Service for Git-Native Projects"""
import json
import base64
from typing import List, Dict, Optional, Any
from datetime import datetime
import hashlib
import re

import httpx
from fastapi import HTTPException, status


class AIIntegrationService:
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"}
        )
        
        # Model configurations
        self.models = {
            "commit_message": "gpt-4-turbo",
            "code_review": "gpt-4",
            "refactor": "gpt-4",
            "documentation": "gpt-4-turbo",
            "generation": "gpt-4"
        }
    
    async def generate_commit_message(self, diff: str, context: Dict[str, Any] = None) -> str:
        """Generate appropriate commit message based on changes"""
        prompt = f"""
        Generate a concise commit message for the following git diff:
        
        DIFF:
        {diff}
        
        CONTEXT:
        {json.dumps(context or {}, indent=2)}
        
        Guidelines:
        - Be specific about what was changed
        - Include relevant AI context if applicable (e.g., "AI-generated", "AI-refactored")
        - Keep it under 72 characters
        - Use imperative mood
        - Include emoji prefix for common change types:
          🎵 = music/audio changes
          🤖 = AI-generated changes
          📝 = documentation changes
          🔧 = code/config changes
          🎨 = UI/styling changes
        
        Commit message:
        """
        
        try:
            response = await self.client.post("/chat/completions", json={
                "model": self.models["commit_message"],
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 100,
                "temperature": 0.7
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"AI service error: {response.text}"
                )
            
            data = response.json()
            message = data["choices"][0]["message"]["content"].strip()
            
            # Ensure it starts with appropriate emoji
            if not re.match(r'^[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]', message):
                # Determine appropriate emoji based on content
                if any(word in diff.lower() for word in ["music", "audio", "sound", "track", "composition"]):
                    message = f"🎵 {message}"
                elif "ai" in diff.lower() or "auto" in diff.lower():
                    message = f"🤖 {message}"
                elif any(word in diff.lower() for word in ["readme", "doc", "markdown", "comment"]):
                    message = f"📝 {message}"
                elif any(word in diff.lower() for word in ["config", "setting", "setup", "build"]):
                    message = f"🔧 {message}"
                elif any(word in diff.lower() for word in ["ui", "style", "css", "design", "layout"]):
                    message = f"🎨 {message}"
                else:
                    message = f"🔧 {message}"
            
            return message
            
        except Exception as e:
            # Fallback to simple commit message
            change_type = context.get("change_type", "update") if context else "update"
            return f"🔧 {change_type}"
    
    async def review_code(self, file_path: str, code: str, focus_areas: List[str] = None, 
                         context: Dict[str, Any] = None) -> Dict[str, Any]:
        """AI-powered code review"""
        focus_areas = focus_areas or ["quality", "performance", "style", "security"]
        
        prompt = f"""
        Review the following code and provide detailed feedback:
        
        FILE: {file_path}
        CODE:
        ```{code}
        ```
        
        FOCUS AREAS: {', '.join(focus_areas)}
        
        CONTEXT:
        {json.dumps(context or {}, indent=2)}
        
        Provide feedback in JSON format with the following structure:
        {{
            "overall_score": 1-10,
            "findings": [
                {{
                    "severity": "critical|warning|info",
                    "category": "quality|performance|style|security|maintainability",
                    "message": "Clear description of the issue",
                    "suggestion": "Specific suggestion for improvement",
                    "line_number": optional line number,
                    "confidence": 0.0-1.0
                }}
            ],
            "summary": {{
                "total_findings": count,
                "critical": count,
                "warnings": count,
                "info": count
            }},
            "strengths": ["List of positive aspects"],
            "improvement_areas": ["Areas that need attention"]
        }}
        
        Make the feedback specific, actionable, and helpful.
        """
        
        try:
            response = await self.client.post("/chat/completions", json={
                "model": self.models["code_review"],
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.3
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"AI service error: {response.text}"
                )
            
            data = response.json()
            ai_response = data["choices"][0]["message"]["content"].strip()
            
            # Parse AI response as JSON
            try:
                review_data = json.loads(ai_response)
            except json.JSONDecodeError:
                # Fallback parsing if AI doesn't return valid JSON
                review_data = self._fallback_parse_review(ai_response)
            
            return {
                "review_id": self._generate_review_id(),
                "file_path": file_path,
                "timestamp": datetime.utcnow().isoformat(),
                "focus_areas": focus_areas,
                "review_data": review_data,
                "ai_model": self.models["code_review"]
            }
            
        except Exception as e:
            # Return basic review if AI service fails
            return self._fallback_review(file_path, code, focus_areas)
    
    async def suggest_refactoring(self, code: str, file_path: str, 
                                context: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Suggest refactoring opportunities"""
        prompt = f"""
        Analyze the following code and suggest refactoring opportunities:
        
        FILE: {file_path}
        CODE:
        ```{code}
        ```
        
        CONTEXT:
        {json.dumps(context or {}, indent=2)}
        
        Identify opportunities for:
        - Code duplication
        - Long functions/methods (>30 lines)
        - Complex conditional logic (>3 levels)
        - Performance issues
        - Code smells
        - Maintainability problems
        
        Return suggestions in JSON format:
        {{
            "suggestions": [
                {{
                    "type": "duplicate_code|long_function|complex_logic|performance|style|security",
                    "severity": "high|medium|low",
                    "description": "Clear description of the issue",
                    "suggestion": "Specific refactoring suggestion",
                    "estimated_effort": "low|medium|high",
                    "potential_benefit": "high|medium|low",
                    "code_snippet": "relevant code section",
                    "revised_code": "suggested improved code"
                }}
            ]
        }}
        
        Be specific and actionable.
        """
        
        try:
            response = await self.client.post("/chat/completions", json={
                "model": self.models["refactor"],
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.3
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"AI service error: {response.text}"
                )
            
            data = response.json()
            ai_response = data["choices"][0]["message"]["content"].strip()
            
            # Parse AI response
            try:
                suggestions_data = json.loads(ai_response)
                return suggestions_data.get("suggestions", [])
            except json.JSONDecodeError:
                return self._fallback_refactor_suggestions(code, file_path)
            
        except Exception as e:
            return self._fallback_refactor_suggestions(code, file_path)
    
    async def generate_documentation(self, code: str, file_path: str, 
                                   format: str = "markdown", 
                                   focus: List[str] = None) -> str:
        """Generate documentation for code"""
        focus = focus or ["api", "usage", "examples"]
        
        prompt = f"""
        Generate {format} documentation for the following code:
        
        FILE: {file_path}
        CODE:
        ```{code}
        ```
        
        FOCUS: {', '.join(focus)}
        
        Generate comprehensive documentation including:
        - Purpose and description
        - Key functions/classes/structures
        - Usage examples
        - Important considerations
        - Dependencies/requirements
        - Return values and parameters
        
        Format: {format}
        """
        
        try:
            response = await self.client.post("/chat/completions", json={
                "model": self.models["documentation"],
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 2000,
                "temperature": 0.7
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"AI service error: {response.text}"
                )
            
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
            
        except Exception as e:
            # Fallback to basic documentation
            return self._generate_basic_documentation(code, file_path, format)
    
    async def generate_ai_content(self, prompt: str, context: Dict[str, Any] = None,
                                content_type: str = "composition") -> Dict[str, Any]:
        """Generate AI content for projects"""
        
        system_prompts = {
            "composition": """You are an expert AI music composer. Generate musical compositions in JSON format with:
            - structure: arrangement sections
            - chords: chord progressions
            - melody: melodic patterns
            - rhythm: rhythmic patterns
            - style: musical style""",
            
            "arrangement": """You are an expert AI arranger. Generate musical arrangements in JSON format with:
            - instrumentation: instrument choices
            - structure: song structure
            - dynamics: volume and expression changes
            - transitions: between sections""",
            
            "mixing": """You are an expert AI mixing engineer. Generate mixing instructions in JSON format with:
            - levels: volume levels
            - panning: stereo placement
            - effects: reverb, delay, EQ, compression
            - automation: dynamic changes"""
        }
        
        full_prompt = f"""
        {system_prompts.get(content_type, "You are a helpful AI assistant.")}
        
        USER PROMPT: {prompt}
        
        CONTEXT:
        {json.dumps(context or {}, indent=2)}
        
        Generate professional, creative content that follows best practices.
        """
        
        try:
            response = await self.client.post("/chat/completions", json={
                "model": self.models["generation"],
                "messages": [{"role": "user", "content": full_prompt}],
                "max_tokens": 2000,
                "temperature": 0.8
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"AI service error: {response.text}"
                )
            
            data = response.json()
            generated_content = data["choices"][0]["message"]["content"].strip()
            
            return {
                "content": generated_content,
                "content_type": content_type,
                "timestamp": datetime.utcnow().isoformat(),
                "model": self.models["generation"],
                "prompt": prompt,
                "context": context
            }
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI content generation failed: {str(e)}"
            )
    
    def _generate_review_id(self) -> str:
        """Generate unique review ID"""
        return f"rev_{hashlib.md5(str(datetime.utcnow()).encode()).hexdigest()[:8]}"
    
    def _fallback_parse_review(self, response: str) -> Dict[str, Any]:
        """Fallback parsing for AI review response"""
        return {
            "overall_score": 7,
            "findings": [],
            "summary": {
                "total_findings": 0,
                "critical": 0,
                "warnings": 0,
                "info": 0
            },
            "strengths": [],
            "improvement_areas": []
        }
    
    def _fallback_review(self, file_path: str, code: str, focus_areas: List[str]) -> Dict[str, Any]:
        """Fallback code review when AI service fails"""
        return {
            "review_id": self._generate_review_id(),
            "file_path": file_path,
            "timestamp": datetime.utcnow().isoformat(),
            "focus_areas": focus_areas,
            "review_data": {
                "overall_score": 7,
                "findings": [],
                "summary": {
                    "total_findings": 0,
                    "critical": 0,
                    "warnings": 0,
                    "info": 0
                },
                "strengths": ["Code structure is clear"],
                "improvement_areas": ["Add more comments for complex logic"]
            },
            "ai_model": "fallback",
            "status": "degraded"
        }
    
    def _fallback_refactor_suggestions(self, code: str, file_path: str) -> List[Dict[str, Any]]:
        """Fallback refactoring suggestions"""
        return [
            {
                "type": "style",
                "severity": "low",
                "description": "Code formatting could be improved",
                "suggestion": "Follow consistent indentation and spacing",
                "estimated_effort": "low",
                "potential_benefit": "low",
                "code_snippet": code[:100] + "...",
                "revised_code": code
            }
        ]
    
    def _generate_basic_documentation(self, code: str, file_path: str, format: str) -> str:
        """Generate basic fallback documentation"""
        return f"""# {file_path}

This file contains code for Beehive Studio project.

## Overview
Basic implementation for AI-powered music generation.

## Structure
- Functions for music composition
- Configuration settings
- Utility functions

## Usage
```python
# Example usage
# TODO: Add specific usage examples
```

## Notes
This documentation was auto-generated. Please review and customize as needed.
"""
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()