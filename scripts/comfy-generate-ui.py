#!/usr/bin/env python3
"""Generate professional Beehive Studio UI mockups via the local ComfyUI API."""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

COMFY_HOST = os.environ.get("COMFY_HOST", "127.0.0.1:8188")
CHECKPOINT = "DreamShaper_8_pruned.safetensors"
OUTPUT_DIR = Path("/home/kilisan/beehive-studio/build/designs")

PROMPT = """professional digital audio workstation software UI screenshot, dark charcoal graphite background, warm amber and honey-yellow accent colors, subtle hexagonal honeycomb motif, clean modern layout, clip launcher grid on the left, timeline arranger at the top, transport play controls, left sidebar with icon rail, bottom console panel, bee-hive inspired color palette, sleek minimal design, flat UI, high detail, 4k, UI/UX design, Behance"""

NEGATIVE = """blurry, low quality, watermark, text, letters, words, people, photograph, 3d render, messy, cluttered, bright white background, oversaturated"""


def build_workflow(seed: int, width: int = 512, height: int = 512):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": PROMPT, "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "seed": seed,
                "steps": 12,
                "cfg": 7.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "beehive_ui", "images": ["6", 0]},
        },
    }


def queue_prompt(workflow: dict):
    payload = {"prompt": workflow}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"http://{COMFY_HOST}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def get_history(prompt_id: str, timeout: float = 300.0):
    deadline = time.time() + timeout
    url = f"http://{COMFY_HOST}/history/{prompt_id}"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                history = json.loads(resp.read().decode())
                if prompt_id in history:
                    return history[prompt_id]
        except urllib.error.HTTPError:
            pass
        time.sleep(2)
    raise TimeoutError("ComfyUI did not finish generation in time")


def fetch_image(filename: str, subfolder: str, folder_type: str):
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    url = f"http://{COMFY_HOST}/view?{params}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read()


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    seed = int(os.environ.get("SEED", random.randint(1, 1_000_000_000)))
    print(f"Generating UI mockup with seed {seed}...")

    workflow = build_workflow(seed)
    result = queue_prompt(workflow)
    prompt_id = result["prompt_id"]
    print(f"Queued prompt {prompt_id}")

    history = get_history(prompt_id)
    outputs = history.get("outputs", {})
    if not outputs:
        print("No outputs in history", file=sys.stderr)
        return 1

    saved = []
    for node_id, node_output in outputs.items():
        for img in node_output.get("images", []):
            filename = img["filename"]
            subfolder = img.get("subfolder", "")
            folder_type = img.get("type", "output")
            data = fetch_image(filename, subfolder, folder_type)
            out_path = OUTPUT_DIR / filename
            out_path.write_bytes(data)
            saved.append(str(out_path))
            print(f"Saved {out_path}")

    return 0 if saved else 1


if __name__ == "__main__":
    sys.exit(main())
