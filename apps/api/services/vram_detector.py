"""
VRAM / GPU capability detector for JetBee.

Provides a "capability-aware" UI tier:
  ≤6 GB   → low    (disable swarm, prefer turbo, short clips)
  6–8 GB  → medium (single-agent mode, turbo/sft)
  8–16 GB → good   (standard swarm, full models)
  16+ GB  → great  (XL models, YuE available, concurrent agents)
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class GpuInfo:
    vendor: str  # nvidia, amd, intel, apple
    name: str
    vram_mb: int
    vram_gb: float
    tier: str  # low, medium, good, great
    driver: str | None = None
    compute_capability: str | None = None


@dataclass
class SystemCapability:
    gpus: list[GpuInfo]
    total_vram_mb: int
    tier: str
    recommended_model: str
    yue_available: bool
    concurrent_agents: int


def _run_cmd(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout + result.stderr
    except Exception as exc:
        logger.debug("Command failed: %s — %s", cmd, exc)
        return ""


def _detect_nvidia() -> list[GpuInfo]:
    """Detect NVIDIA GPUs via nvidia-smi."""
    if not shutil.which("nvidia-smi"):
        return []

    output = _run_cmd(["nvidia-smi", "--query-gpu=name,memory.total,driver_version,compute_cap", "--format=csv,noheader"])
    gpus: list[GpuInfo] = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            continue
        name = parts[0]
        mem_str = parts[1]
        driver = parts[2] if len(parts) > 2 else None
        compute_cap = parts[3] if len(parts) > 3 else None

        # Parse memory (e.g. "8192 MiB" or "8 GiB")
        mem_match = re.search(r"(\d+)\s*(MiB|GiB|MB|GB)", mem_str, re.IGNORECASE)
        if mem_match:
            mem_val = int(mem_match.group(1))
            mem_unit = mem_match.group(2).lower()
            vram_mb = mem_val if mem_unit in ("mib", "mb") else mem_val * 1024
        else:
            vram_mb = 0

        vram_gb = vram_mb / 1024
        tier = _tier_from_vram(vram_gb)
        gpus.append(GpuInfo(
            vendor="nvidia",
            name=name,
            vram_mb=vram_mb,
            vram_gb=vram_gb,
            tier=tier,
            driver=driver,
            compute_capability=compute_cap,
        ))
    return gpus


def _detect_amd() -> list[GpuInfo]:
    """Detect AMD GPUs via rocm-smi."""
    if not shutil.which("rocm-smi"):
        return []

    output = _run_cmd(["rocm-smi", "--showproductname", "--showmeminfo", "vram"])
    # rocm-smi output is less structured; do basic parsing
    gpus: list[GpuInfo] = []
    lines = output.strip().split("\n")
    for i, line in enumerate(lines):
        if "GPU" in line and "VRAM" in line:
            mem_match = re.search(r"(\d+)\s*MB", line)
            vram_mb = int(mem_match.group(1)) if mem_match else 0
            vram_gb = vram_mb / 1024
            tier = _tier_from_vram(vram_gb)
            gpus.append(GpuInfo(
                vendor="amd",
                name="AMD GPU",
                vram_mb=vram_mb,
                vram_gb=vram_gb,
                tier=tier,
            ))
    return gpus


def _detect_apple() -> list[GpuInfo]:
    """Detect Apple Silicon unified memory."""
    if not shutil.which("system_profiler"):
        return []

    output = _run_cmd(["system_profiler", "SPDisplaysDataType"])
    # Parse for Apple Silicon (M1/M2/M3/M4)
    apple_match = re.search(r"Apple M(\d+)(?: Pro| Max| Ultra)?", output)
    if not apple_match:
        return []

    chip_num = int(apple_match.group(1))
    # Unified memory detection via vm_stat or sysctl
    mem_output = _run_cmd(["sysctl", "-n", "hw.memsize"])
    try:
        total_bytes = int(mem_output.strip())
        vram_mb = total_bytes // (1024 * 1024)
    except ValueError:
        vram_mb = 16384  # Default assumption for Apple Silicon

    vram_gb = vram_mb / 1024
    tier = _tier_from_vram(vram_gb)
    # Apple Silicon gets a bump because unified memory is more efficient
    if tier == "medium" and chip_num >= 3:
        tier = "good"

    return [GpuInfo(
        vendor="apple",
        name=f"Apple M{chip_num}",
        vram_mb=vram_mb,
        vram_gb=vram_gb,
        tier=tier,
    )]


def _detect_intel() -> list[GpuInfo]:
    """Detect Intel GPUs via intel_gpu_top or lspci fallback."""
    if shutil.which("intel_gpu_top"):
        output = _run_cmd(["intel_gpu_top", "-L"])
        # intel_gpu_top -L lists devices
        # Very basic parsing
        if "Intel" in output:
            return [GpuInfo(vendor="intel", name="Intel GPU", vram_mb=4096, vram_gb=4, tier="low")]

    # Fallback: check for Intel in lspci
    if shutil.which("lspci"):
        output = _run_cmd(["lspci"])
        if "Intel Corporation" in output and ("VGA" in output or "Display" in output):
            return [GpuInfo(vendor="intel", name="Intel Integrated", vram_mb=4096, vram_gb=4, tier="low")]

    return []


def _tier_from_vram(vram_gb: float) -> str:
    if vram_gb <= 6:
        return "low"
    elif vram_gb <= 8:
        return "medium"
    elif vram_gb <= 16:
        return "good"
    else:
        return "great"


def _recommendation_from_tier(tier: str) -> dict[str, Any]:
    return {
        "low": {
            "recommended_model": "acestep-turbo-2b",
            "yue_available": False,
            "concurrent_agents": 1,
            "max_duration": 15,
            "swarm_enabled": False,
        },
        "medium": {
            "recommended_model": "acestep-turbo-2b",
            "yue_available": False,
            "concurrent_agents": 2,
            "max_duration": 30,
            "swarm_enabled": True,
        },
        "good": {
            "recommended_model": "acestep-sft-4b",
            "yue_available": True,
            "concurrent_agents": 4,
            "max_duration": 60,
            "swarm_enabled": True,
        },
        "great": {
            "recommended_model": "acestep-xl-4b",
            "yue_available": True,
            "concurrent_agents": 8,
            "max_duration": 120,
            "swarm_enabled": True,
        },
    }[tier]


def detect_gpus() -> list[GpuInfo]:
    """Detect all GPUs on the system."""
    gpus: list[GpuInfo] = []
    gpus.extend(_detect_nvidia())
    gpus.extend(_detect_amd())
    gpus.extend(_detect_apple())
    gpus.extend(_detect_intel())
    return gpus


def get_system_capability() -> SystemCapability:
    """Get full system capability report."""
    gpus = detect_gpus()
    total_vram = sum(g.vram_mb for g in gpus)
    total_gb = total_vram / 1024

    # Determine overall tier from best GPU (not sum)
    best_tier = "low"
    tier_order = ["low", "medium", "good", "great"]
    for g in gpus:
        if tier_order.index(g.tier) > tier_order.index(best_tier):
            best_tier = g.tier

    rec = _recommendation_from_tier(best_tier)

    return SystemCapability(
        gpus=gpus,
        total_vram_mb=total_vram,
        tier=best_tier,
        recommended_model=rec["recommended_model"],
        yue_available=rec["yue_available"],
        concurrent_agents=rec["concurrent_agents"],
    )


# ── FastAPI routes ─────────────────────────────────────────────

def register_routes(app: Any) -> None:
    from fastapi import APIRouter

    router = APIRouter(prefix="/system", tags=["system"])

    @router.get("/gpu")
    async def get_gpu_info() -> dict[str, Any]:
        gpus = detect_gpus()
        return {
            "gpus": [
                {
                    "vendor": g.vendor,
                    "name": g.name,
                    "vram_mb": g.vram_mb,
                    "vram_gb": round(g.vram_gb, 1),
                    "tier": g.tier,
                    "driver": g.driver,
                    "compute_capability": g.compute_capability,
                }
                for g in gpus
            ],
            "count": len(gpus),
        }

    @router.get("/capability")
    async def get_capability() -> dict[str, Any]:
        cap = get_system_capability()
        rec = _recommendation_from_tier(cap.tier)
        return {
            "tier": cap.tier,
            "total_vram_mb": cap.total_vram_mb,
            "total_vram_gb": round(cap.total_vram_mb / 1024, 1),
            "recommended_model": cap.recommended_model,
            "yue_available": cap.yue_available,
            "concurrent_agents": cap.concurrent_agents,
            "max_duration": rec["max_duration"],
            "swarm_enabled": rec["swarm_enabled"],
            "gpus": [
                {"vendor": g.vendor, "name": g.name, "vram_gb": round(g.vram_gb, 1)}
                for g in cap.gpus
            ],
        }

    app.include_router(router)
