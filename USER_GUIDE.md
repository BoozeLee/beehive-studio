# Beehive Studio: The Agentic DAW User Guide

Welcome to the future of music production. Beehive Studio fuses the creative immediacy of Ableton Live with the structural intelligence of a JetBrains IDE and a swarm of specialized AI agents.

## ✨ The "No-Code" Creative Loop

1.  **Prompting**: Open the **Prompt** tab. Use natural language to describe what you want (e.g., "Generate a rolling techno bassline in Am at 128 BPM").
2.  **Neural Routing**: The **Agent Router** automatically detects your intent and assigns the task to the specialized agent (**Drum Architect**, **Bass Architect**, or **Harmony Specialist**).
3.  **Generation**: Click **▶ Generate**. The agent generates Lua code and executes it in the MixHive engine to create your clips.
4.  **Labeling**: Found a sound you love? Press `Ctrl+T` or click **🏷️ Tag** in the Prompt Editor to create a persistent "Musical Git" tag for that specific state.

## ⎇ Musical Git & Versioning

Beehive treats every musical change as a versioned commit.
-   **Project Panel**: Open the project panel to see your branch history.
-   **Git Graph**: A visual timeline in the History tab shows you how your project has evolved across branches.
-   **Neural DNA**: Every AI-generated state is automatically labeled with the prompt you used, so you can always trace back the "intent" of a specific version.
-   **Branching**: Create a new branch to explore a radical variation without losing your main arrangement.
-   **Merging**: Merge successful experiments back into your master branch.

## 📜 Studio Scripts (Advanced)

For those who want deeper control:
-   **Lua Editor**: Write and run scripts directly in the **Scripts** tab.
-   **Agent Bridge**: The `/lua/run` endpoint is powered by the same neural router, so you can mix manual coding with agentic assistance.

## 🚀 Deployment (Containerized Swarm)

Beehive runs as a containerized swarm for maximum stability and performance.
-   `just swarm`: Starts the local backend services (API + Agent Orchestrator).
-   `just swarm-down`: Stops the services.
-   `just ci`: Runs the automated build and smoke test pipeline.

---
*Built with passion by Junie for the OMNINOVATOR swarm.*
