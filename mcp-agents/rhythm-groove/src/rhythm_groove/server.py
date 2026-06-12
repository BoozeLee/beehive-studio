"""Rhythm & Groove Agent — MCP-native beat and bassline generation."""
import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("beehive-rhythm-groove")

TOOLS = [
    Tool(
        name="generate_bassline",
        description="Generate a rolling bassline MIDI pattern",
        inputSchema={
            "type": "object",
            "properties": {
                "bpm": {"type": "integer", "default": 130},
                "style": {"type": "string", "enum": ["techno", "house", "acid", "minimal"]},
                "root_note": {"type": "string", "default": "C"},
                "bars": {"type": "integer", "default": 4},
            },
            "required": ["style"],
        },
    ),
    Tool(
        name="generate_drum_pattern",
        description="Generate a drum pattern for specified genre",
        inputSchema={
            "type": "object",
            "properties": {
                "bpm": {"type": "integer", "default": 130},
                "style": {"type": "string", "enum": ["techno", "house", "breakbeat", "minimal"]},
                "variation": {"type": "string", "enum": ["straight", "swung", "ghost_notes"], "default": "straight"},
                "bars": {"type": "integer", "default": 4},
            },
            "required": ["style"],
        },
    ),
]


@app.list_tools()
async def list_tools() -> list[Tool]:
    return TOOLS


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "generate_bassline":
        notes = _generate_bassline_notes(**arguments)
        return [TextContent(type="text", text=notes)]
    elif name == "generate_drum_pattern":
        pattern = _generate_drum_pattern(**arguments)
        return [TextContent(type="text", text=pattern)]
    raise ValueError(f"Unknown tool: {name}")


def _generate_bassline_notes(bpm: int, style: str, root_note: str, bars: int) -> str:
    """Generate bassline as JSON string."""
    import json
    # Simplified generation — will connect to inference layer in future task
    pattern = []
    for bar in range(bars):
        for step in range(16):
            if style == "techno" and step in [0, 4, 8, 12]:
                pattern.append({"note": f"{root_note}2", "velocity": 100, "start": bar * 4 + step / 4, "duration": 0.25})
            elif style == "acid" and step in [0, 3, 6, 10, 12]:
                pattern.append({"note": f"{root_note}2", "velocity": 110, "start": bar * 4 + step / 4, "duration": 0.125})
    return json.dumps({"bpm": bpm, "style": style, "notes": pattern})


def _generate_drum_pattern(bpm: int, style: str, variation: str, bars: int) -> str:
    """Generate drum pattern as JSON string."""
    import json
    kick = [1 if i % 4 == 0 else 0 for i in range(16 * bars)]
    snare = [1 if i % 8 == 4 else 0 for i in range(16 * bars)]
    hihat = [1 if i % 2 == 0 else 0 for i in range(16 * bars)]
    if variation == "swung":
        hihat = [1 if i % 2 == 0 and i % 4 != 2 else 0 for i in range(16 * bars)]
    return json.dumps({"bpm": bpm, "style": style, "kick": kick, "snare": snare, "hihat": hihat})


async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
