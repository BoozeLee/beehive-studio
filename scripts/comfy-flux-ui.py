#!/usr/bin/env python3
"""Generate Beehive Studio UI mockups with ComfyUI + Flux Schnell (GGUF)."""
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
OUTPUT_DIR = Path("/home/kilisan/beehive-studio/build/designs")

POSITIVE = (
    "professional digital audio workstation software UI screenshot, "
    "dark graphite and obsidian background, warm amber and honey-yellow accent colors, "
    "subtle hexagonal honeycomb motif, clean minimal layout, clip launcher grid on the left, "
    "timeline arranger at the top, transport play controls, left sidebar with icon rail, "
    "bottom console panel, bee-hive inspired color palette, flat UI, high detail, "
    "UI/UX design, Behance, 4k"
)

NEGATIVE = (
    "blurry, low quality, watermark, text, letters, words, people, photograph, "
    "3d render, messy, cluttered, bright white background, oversaturated"
)


def build_flux_workflow(seed: int, width: int = 1024, height: int = 576) -> dict:
    return {
        "1": {
            "class_type": "UnetLoaderGGUF",
            "inputs": {"unet_name": "flux1-schnell-Q4_K_S.gguf"},
        },
        "2": {
            "class_type": "DualCLIPLoaderGGUF",
            "inputs": {
                "clip_name1": "t5-v1_1-xxl-encoder-Q3_K_S.gguf",
                "clip_name2": "clip_l.safetensors",
                "type": "flux",
            },
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "flux-vae-bf16.safetensors"},
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": POSITIVE, "clip": ["2", 0]},
        },
        "5": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE, "clip": ["2", 0]},
        },
        "6": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "seed": seed,
                "steps": 4,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
                "denoise": 1.0,
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["7", 0], "vae": ["3", 0]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "beehive_flux_ui", "images": ["8", 0]},
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


def get_history(prompt_id: str, timeout: float = 600.0):
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
    import urllib.parse
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    url = f"http://{COMFY_HOST}/view?{params}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read()


def generate_one(seed: int) -> list[Path]:
    workflow = build_flux_workflow(seed)
    result = queue_prompt(workflow)
    prompt_id = result["prompt_id"]
    print(f"Seed {seed}: queued {prompt_id}")

    history = get_history(prompt_id)
    outputs = history.get("outputs", {})
    saved: list[Path] = []
    for node_id, node_output in outputs.items():
        for img in node_output.get("images", []):
            data = fetch_image(img["filename"], img.get("subfolder", ""), img.get("type", "output"))
            out = OUTPUT_DIR / img["filename"]
            out.write_bytes(data)
            saved.append(out)
            print(f"  -> {out}")
    return saved


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    seeds = [int(s) for s in os.environ.get("SEEDS", "1,42,123,777").split(",")]
    for seed in seeds:
        try:
            generate_one(seed)
        except Exception as e:
            print(f"Seed {seed} failed: {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
