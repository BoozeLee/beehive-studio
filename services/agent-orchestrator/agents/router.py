import json
import os
from pathlib import Path
from typing import Optional, Dict, Any

class AgentRouter:
    """
    OMNINOVATOR Agent Router.
    Dynamically routes user intent to specialized agent prompts defined in the registry.
    """
    
    def __init__(self, registry_path: Optional[str] = None):
        if registry_path is None:
            # Check if we are in a container
            if os.getenv("RUNNING_IN_DOCKER") == "1":
                registry_path = Path("/app/prompts/registry.json")
            else:
                # Default path relative to this file
                registry_path = Path(__file__).parent.parent / "prompts" / "registry.json"
        
        self.registry_path = Path(registry_path)
        self.registry = self._load_registry()
        
    def _load_registry(self) -> Dict[str, Any]:
        if not self.registry_path.exists():
            print(f"Warning: Registry not found at {self.registry_path}")
            return {"agents": {}}
        
        try:
            with open(self.registry_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading registry: {e}")
            return {"agents": {}}

    def get_agent_config(self, agent_id: str, version: Optional[str] = None) -> Optional[Dict[str, Any]]:
        agents = self.registry.get("agents", {})
        if agent_id not in agents:
            return None
            
        agent_data = agents[agent_id]
        target_version = version or agent_data.get("default_version")
        
        prompt_path = agent_data.get("versions", {}).get(target_version)
        if not prompt_path:
            return None
            
        # Resolve prompt path relative to the root of the project
        if os.getenv("RUNNING_IN_DOCKER") == "1":
            project_root = Path("/app")
        else:
            # registry_path is in services/agent-orchestrator/prompts/
            # root is parent.parent.parent.parent
            project_root = self.registry_path.parent.parent.parent.parent
            
        full_prompt_path = project_root / prompt_path
        
        prompt_content = ""
        if full_prompt_path.exists():
            with open(full_prompt_path, 'r') as f:
                prompt_content = f.read()
        
        return {
            "agent_id": agent_id,
            "version": target_version,
            "prompt": prompt_content,
            "config": agent_data.get("config", {})
        }

    def route_intent(self, user_input: str) -> str:
        """
        Heuristic-based intent routing.
        """
        user_input_lower = user_input.lower()
        if any(word in user_input_lower for word in ["drum", "kick", "snare", "hat", "rhythm", "groove", "beat", "perc"]):
            return "drum_architect"
        if any(word in user_input_lower for word in ["chord", "harmony", "progression", "pad", "keys", "piano", "synth"]):
            return "harmony_specialist"
        if any(word in user_input_lower for word in ["bass", "sub", "low end", "acid", "303", " Reese"]):
            return "bass_architect"
            
        return "drum_architect" # Default to drums for now

    async def async_route_intent(self, user_input: str, inference_client: Any = None) -> str:
        """
        Neural intent routing using LLM classification with heuristic fallback.
        """
        if inference_client:
            try:
                agents = self.registry.get("agents", {}).keys()
                agent_list = ", ".join(agents)
                
                system_prompt = f"""
                You are the Beehive Intent Router. 
                Classify the user's musical request into exactly one of these agents: {agent_list}.
                Return ONLY the agent name.
                """
                
                response = await inference_client.generate(
                    prompt=f"Request: {user_input}\nAgent:",
                    system=system_prompt,
                    model="llama3"
                )
                
                detected_agent = response.strip().lower()
                for agent_id in agents:
                    if agent_id in detected_agent:
                        return agent_id
            except Exception as e:
                print(f"Neural routing failed: {e}. Falling back to heuristics.")
        
        return self.route_intent(user_input)
