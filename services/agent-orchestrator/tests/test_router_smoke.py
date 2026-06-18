from agents.router import AgentRouter
import os

def test_router():
    router = AgentRouter()
    
    # Test intent routing
    intent = router.route_intent("I want some heavy techno drums")
    print(f"Intent for 'heavy techno drums': {intent}")
    assert intent == "drum_architect"
    
    intent = router.route_intent("Generate a jazz chord progression")
    print(f"Intent for 'jazz chord progression': {intent}")
    assert intent == "harmony_specialist"
    
    # Test config loading
    config = router.get_agent_config("drum_architect")
    print(f"Drum Architect Config: {config['version']}, model: {config['config']['model']}")
    assert config["agent_id"] == "drum_architect"
    assert "PROMPT_PATH" in config["prompt"] or "# Drum" in config["prompt"] or config["prompt"] != ""
    
    print("AgentRouter tests passed! ✅")

if __name__ == "__main__":
    # Ensure we are in services/agent-orchestrator to run this easily
    test_router()
