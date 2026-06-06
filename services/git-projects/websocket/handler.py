"""WebSocket Collaboration Handler for Git-Native Projects"""
import asyncio
import json
import uuid
import logging
from typing import Dict, Set, List, Optional, Any
from datetime import datetime, timedelta
import websockets
from websockets.server import WebSocketServerProtocol

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel


class CollaborationMessage(BaseModel):
    type: str
    user_id: str
    project_id: str
    timestamp: str
    data: Dict[str, Any]


class CursorPosition(BaseModel):
    line: int
    column: int
    file_path: Optional[str] = None


class SelectionRange(BaseModel):
    start: CursorPosition
    end: CursorPosition
    file_path: str


class FileEdit(BaseModel):
    operation: str  # "insert" | "delete" | "replace"
    content: str
    position: CursorPosition
    file_path: str
    selected_range: Optional[SelectionRange] = None


class CollaborationHandler:
    def __init__(self):
        # Active WebSocket connections
        self.active_connections: Dict[str, WebSocketServerProtocol] = {}
        
        # Project room mappings
        self.project_rooms: Dict[str, Set[str]] = {}  # project_id -> set of connection_ids
        
        # User information
        self.user_info: Dict[str, Dict[str, Any]] = {}  # connection_id -> user_info
        
        # Cursor positions
        self.user_cursors: Dict[str, Dict[str, Any]] = {}  # user_id -> cursor_info
        
        # File editing state
        self.file_edits: Dict[str, List[Dict[str, Any]]] = {}  # file_path -> list of edits
        
        # Project activity tracking
        self.project_activity: Dict[str, Dict[str, Any]] = {}  # project_id -> activity_stats
        
        # Operation locks to prevent race conditions
        self.operation_locks: Dict[str, asyncio.Lock] = {}  # project_id -> lock
        
        # Set up logging
        self.logger = logging.getLogger(__name__)
        
        # Activity cleanup timer
        self.activity_cleanup_task = asyncio.create_task(self._cleanup_activity())
    
    async def connect(self, websocket: WebSocketServerProtocol, user_id: str, project_id: str):
        """Handle new WebSocket connection"""
        connection_id = str(uuid.uuid4())
        
        # Store connection
        self.active_connections[connection_id] = websocket
        self.user_info[connection_id] = {
            "user_id": user_id,
            "project_id": project_id,
            "connected_at": datetime.utcnow().isoformat(),
            "last_activity": datetime.utcnow().isoformat()
        }
        
        # Add to project room
        if project_id not in self.project_rooms:
            self.project_rooms[project_id] = set()
        self.project_rooms[project_id].add(connection_id)
        
        # Initialize project activity tracking
        if project_id not in self.project_activity:
            self.project_activity[project_id] = {
                "session_start": datetime.utcnow().isoformat(),
                "total_users": 0,
                "active_users": 0,
                "total_edits": 0,
                "total_commits": 0,
                "ai_operations": 0,
                "last_activity": datetime.utcnow().isoformat()
            }
        
        # Initialize operation lock for project
        if project_id not in self.operation_locks:
            self.operation_locks[project_id] = asyncio.Lock()
        
        # Update activity
        self.project_activity[project_id]["total_users"] += 1
        self.project_activity[project_id]["active_users"] += 1
        self.project_activity[project_id]["last_activity"] = datetime.utcnow().isoformat()
        
        # Send welcome message
        welcome_message = {
            "type": "connected",
            "connection_id": connection_id,
            "user_id": user_id,
            "project_id": project_id,
            "timestamp": datetime.utcnow().isoformat(),
            "project_stats": self.project_activity[project_id]
        }
        
        await websocket.send(json.dumps(welcome_message))
        
        # Notify other users in the project
        await self._broadcast_to_project(project_id, {
            "type": "user_joined",
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "active_users": self.project_activity[project_id]["active_users"]
        }, exclude=connection_id)
        
        self.logger.info(f"User {user_id} connected to project {project_id} (connection_id: {connection_id})")
    
    async def disconnect(self, websocket: WebSocketServerProtocol, connection_id: str):
        """Handle WebSocket disconnection"""
        if connection_id not in self.active_connections:
            return
        
        # Get user and project info
        user_info = self.user_info.get(connection_id, {})
        user_id = user_info.get("user_id")
        project_id = user_info.get("project_id")
        
        # Remove connection
        del self.active_connections[connection_id]
        self.user_info.pop(connection_id, None)
        
        # Remove from project room
        if project_id and project_id in self.project_rooms:
            self.project_rooms[project_id].discard(connection_id)
            
            # Update activity
            if project_id in self.project_activity:
                self.project_activity[project_id]["active_users"] -= 1
                self.project_activity[project_id]["last_activity"] = datetime.utcnow().isoformat()
        
        # Notify other users
        if user_id and project_id:
            await self._broadcast_to_project(project_id, {
                "type": "user_left",
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat(),
                "active_users": self.project_activity[project_id]["active_users"]
            })
        
        self.logger.info(f"User {user_id} disconnected from project {project_id} (connection_id: {connection_id})")
    
    async def handle_message(self, websocket: WebSocketServerProtocol, connection_id: str, message: str):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            # Update user activity
            if connection_id in self.user_info:
                self.user_info[connection_id]["last_activity"] = datetime.utcnow().isoformat()
            
            # Route message based on type
            if msg_type == "cursor_update":
                await self._handle_cursor_update(connection_id, data)
            elif msg_type == "file_edit":
                await self._handle_file_edit(connection_id, data)
            elif msg_type == "selection":
                await self._handle_selection(connection_id, data)
            elif msg_type == "operation_start":
                await self._handle_operation_start(connection_id, data)
            elif msg_type == "operation_complete":
                await self._handle_operation_complete(connection_id, data)
            elif msg_type == "ai_operation":
                await self._handle_ai_operation(connection_id, data)
            elif msg_type == "typing_indicator":
                await self._handle_typing_indicator(connection_id, data)
            elif msg_type == "heartbeat":
                await self._handle_heartbeat(connection_id, data)
            else:
                self.logger.warning(f"Unknown message type: {msg_type}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                    "timestamp": datetime.utcnow().isoformat()
                }))
        
        except json.JSONDecodeError:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON format",
                "timestamp": datetime.utcnow().isoformat()
            }))
        except Exception as e:
            self.logger.error(f"Error handling message: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Internal error: {str(e)}",
                "timestamp": datetime.utcnow().isoformat()
            }))
    
    async def _handle_cursor_update(self, connection_id: str, data: Dict[str, Any]):
        """Handle cursor position updates"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        
        cursor_data = {
            "user_id": user_id,
            "position": data.get("position", {}),
            "file_path": data.get("file_path"),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Store cursor position
        self.user_cursors[user_id] = cursor_data
        
        # Broadcast to other users in the project
        await self._broadcast_to_project(project_id, {
            "type": "cursor_update",
            "user_id": user_id,
            "position": cursor_data["position"],
            "file_path": cursor_data["file_path"],
            "timestamp": cursor_data["timestamp"]
        }, exclude=connection_id)
    
    async def _handle_file_edit(self, connection_id: str, data: Dict[str, Any]):
        """Handle file editing operations"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        
        edit_data = {
            "operation": data.get("operation"),
            "content": data.get("content", ""),
            "position": data.get("position", {}),
            "file_path": data.get("file_path"),
            "selected_range": data.get("selected_range"),
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Store edit in file history
        file_path = edit_data["file_path"]
        if file_path not in self.file_edits:
            self.file_edits[file_path] = []
        self.file_edits[file_path].append(edit_data)
        
        # Update project activity
        if project_id in self.project_activity:
            self.project_activity[project_id]["total_edits"] += 1
            self.project_activity[project_id]["last_activity"] = datetime.utcnow().isoformat()
        
        # Broadcast edit to other users
        await self._broadcast_to_project(project_id, {
            "type": "file_edit",
            "operation": edit_data["operation"],
            "content": edit_data["content"],
            "position": edit_data["position"],
            "file_path": edit_data["file_path"],
            "selected_range": edit_data["selected_range"],
            "user_id": user_id,
            "timestamp": edit_data["timestamp"]
        }, exclude=connection_id)
    
    async def _handle_selection(self, connection_id: str, data: Dict[str, Any]):
        """Handle text selection updates"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        
        selection_data = {
            "user_id": user_id,
            "selection": data.get("selection", {}),
            "file_path": data.get("file_path"),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast to other users
        await self._broadcast_to_project(project_id, {
            "type": "selection",
            "user_id": user_id,
            "selection": selection_data["selection"],
            "file_path": selection_data["file_path"],
            "timestamp": selection_data["timestamp"]
        }, exclude=connection_id)
    
    async def _handle_operation_start(self, connection_id: str, data: Dict[str, Any]):
        """Handle start of long-running operations"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        operation_type = data.get("operation_type")
        
        # Acquire operation lock
        if project_id in self.operation_locks:
            await self.operation_locks[project_id].acquire()
        
        # Notify users about operation start
        await self._broadcast_to_project(project_id, {
            "type": "operation_start",
            "user_id": user_id,
            "operation_type": operation_type,
            "operation_id": data.get("operation_id"),
            "estimated_duration": data.get("estimated_duration"),
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def _handle_operation_complete(self, connection_id: str, data: Dict[str, Any]):
        """Handle completion of long-running operations"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        operation_type = data.get("operation_type")
        
        # Release operation lock
        if project_id in self.operation_locks:
            self.operation_locks[project_id].release()
        
        # Notify users about operation completion
        await self._broadcast_to_project(project_id, {
            "type": "operation_complete",
            "user_id": user_id,
            "operation_type": operation_type,
            "operation_id": data.get("operation_id"),
            "result": data.get("result"),
            "success": data.get("success", True),
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def _handle_ai_operation(self, connection_id: str, data: Dict[str, Any]):
        """Handle AI-powered operations"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        operation_type = data.get("operation_type")
        
        # Update AI operation count
        if project_id in self.project_activity:
            self.project_activity[project_id]["ai_operations"] += 1
            self.project_activity[project_id]["last_activity"] = datetime.utcnow().isoformat()
        
        # Broadcast AI operation
        await self._broadcast_to_project(project_id, {
            "type": "ai_operation",
            "user_id": user_id,
            "operation_type": operation_type,
            "progress": data.get("progress", 0),
            "status": data.get("status", "started"),
            "description": data.get("description", ""),
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def _handle_typing_indicator(self, connection_id: str, data: Dict[str, Any]):
        """Handle typing indicators"""
        user_id = self.user_info[connection_id]["user_id"]
        project_id = self.user_info[connection_id]["project_id"]
        is_typing = data.get("is_typing", False)
        
        # Broadcast typing indicator
        await self._broadcast_to_project(project_id, {
            "type": "typing_indicator",
            "user_id": user_id,
            "is_typing": is_typing,
            "timestamp": datetime.utcnow().isoformat()
        }, exclude=connection_id)
    
    async def _handle_heartbeat(self, connection_id: str, data: Dict[str, Any]):
        """Handle heartbeat messages for connection health"""
        user_info = self.user_info.get(connection_id, {})
        response = {
            "type": "heartbeat_response",
            "timestamp": datetime.utcnow().isoformat(),
            "connection_id": connection_id,
            "user_info": user_info
        }
        
        # Send response to the specific connection
        websocket = self.active_connections.get(connection_id)
        if websocket:
            await websocket.send(json.dumps(response))
    
    async def _broadcast_to_project(self, project_id: str, message: Dict[str, Any], exclude: str = None):
        """Broadcast message to all users in a project"""
        if project_id not in self.project_rooms:
            return
        
        message_json = json.dumps(message)
        
        for connection_id in self.project_rooms[project_id]:
            if connection_id == exclude:
                continue
            
            websocket = self.active_connections.get(connection_id)
            if websocket and websocket.open:
                try:
                    await websocket.send(message_json)
                except websockets.exceptions.ConnectionClosed:
                    # Connection closed, remove it
                    await self.disconnect(websocket, connection_id)
                except Exception as e:
                    self.logger.error(f"Error broadcasting to {connection_id}: {e}")
    
    async def _cleanup_activity(self):
        """Clean up inactive connections and old activity data"""
        while True:
            try:
                await asyncio.sleep(300)  # Run every 5 minutes
                
                current_time = datetime.utcnow()
                
                # Clean up inactive users (older than 10 minutes)
                inactive_connections = []
                for connection_id, user_info in self.user_info.items():
                    last_activity = datetime.fromisoformat(user_info["last_activity"])
                    if current_time - last_activity > timedelta(minutes=10):
                        inactive_connections.append(connection_id)
                
                # Remove inactive connections
                for connection_id in inactive_connections:
                    websocket = self.active_connections.get(connection_id)
                    if websocket:
                        await self.disconnect(websocket, connection_id)
                
                # Clean up old file edit history (older than 1 hour)
                current_time = datetime.utcnow()
                for file_path, edits in self.file_edits.items():
                    # Keep only recent edits
                    recent_edits = [
                        edit for edit in edits
                        if current_time - datetime.fromisoformat(edit["timestamp"]) < timedelta(hours=1)
                    ]
                    
                    if len(recent_edits) != len(edits):
                        self.file_edits[file_path] = recent_edits
                
                self.logger.info(f"Cleanup completed. Removed {len(inactive_connections)} inactive connections.")
                
            except Exception as e:
                self.logger.error(f"Error in cleanup task: {e}")
    
    async def get_project_stats(self, project_id: str) -> Dict[str, Any]:
        """Get current project collaboration statistics"""
        if project_id not in self.project_activity:
            return {}
        
        stats = self.project_activity[project_id].copy()
        
        # Add current user count
        stats["current_active_users"] = len(self.project_rooms.get(project_id, set()))
        
        # Add recent activity
        recent_edits = []
        current_time = datetime.utcnow()
        
        for file_path, edits in self.file_edits.items():
            recent_file_edits = [
                edit for edit in edits
                if current_time - datetime.fromisoformat(edit["timestamp"]) < timedelta(minutes=30)
            ]
            if recent_file_edits:
                recent_edits.extend(recent_file_edits)
        
        stats["recent_edits"] = len(recent_edits)
        stats["collaboration_score"] = min(100, stats["active_users"] * 20 + stats["ai_operations"] * 5)
        
        return stats
    
    async def get_user_positions(self, project_id: str) -> Dict[str, Any]:
        """Get current cursor positions of all users in a project"""
        user_positions = {}
        
        if project_id in self.project_rooms:
            for connection_id in self.project_rooms[project_id]:
                user_info = self.user_info.get(connection_id)
                if user_info:
                    user_id = user_info["user_id"]
                    cursor_info = self.user_cursors.get(user_id)
                    if cursor_info:
                        user_positions[user_id] = cursor_info
        
        return user_positions