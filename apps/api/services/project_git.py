"""Git-backed project versioning for Beehive Studio."""

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any

PROJECTS_DIR = Path.home() / ".local/share/beehive-studio/projects"

GIT_STATUS_MAP = {
    "M": "Modified",
    "A": "Added",
    "D": "Removed",
    "R": "Renamed",
    "C": "Copied",
    "T": "Type Changed",
    "U": "Unmerged",
    "X": "Unknown",
}


def _project_path(project_id: str) -> Path:
    safe = "".join(c for c in project_id if c.isalnum() or c in "-_") or "untitled"
    path = PROJECTS_DIR / safe
    path.mkdir(parents=True, exist_ok=True)
    return path


def _run_git(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )


async def init_project(project_id: str) -> dict[str, Any]:
    path = _project_path(project_id)
    if not (path / ".git").exists():
        await asyncio.to_thread(_run_git, path, "init")
    return {"project_id": project_id, "path": str(path)}


async def list_branches(project_id: str) -> list[dict[str, Any]]:
    path = _project_path(project_id)
    if not (path / ".git").exists():
        return []
    result = await asyncio.to_thread(
        subprocess.run,
        ["git", "branch", "-a", "--format=%(refname:short)\t%(HEAD)"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    branches = []
    for line in result.stdout.strip().split("\n"):
        if "\t" not in line:
            continue
        name, head = line.split("\t", 1)
        branches.append({"name": name, "is_current": head == "*"})
    return branches


async def create_branch(project_id: str, branch: str) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(_run_git, path, "checkout", "-b", branch)
    return {"branch": branch}


async def checkout_branch(project_id: str, branch: str) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(_run_git, path, "checkout", branch)
    return {"branch": branch}


async def delete_branch(project_id: str, branch: str) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(_run_git, path, "branch", "-D", branch)
    return {"deleted": branch}


async def get_log(project_id: str, count: int = 50) -> list[dict[str, Any]]:
    path = _project_path(project_id)
    if not (path / ".git").exists():
        return []
    fmt = "%H\t%h\t%s\t%an\t%at"
    result = await asyncio.to_thread(
        subprocess.run,
        ["git", "log", f"-{count}", f"--format={fmt}"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    commits = []
    for line in result.stdout.strip().split("\n"):
        parts = line.split("\t", 4)
        if len(parts) == 5:
            commits.append(
                {
                    "hash": parts[0],
                    "short_hash": parts[1],
                    "message": parts[2],
                    "author": parts[3],
                    "timestamp": int(parts[4]),
                }
            )
    return commits


async def get_diff(
    project_id: str, ref1: str | None, ref2: str | None
) -> list[dict[str, Any]]:
    path = _project_path(project_id)
    if not (path / ".git").exists():
        return []
    args = ["git", "diff", "--name-status"]
    if ref1 and ref2:
        args.extend([ref1, ref2])
    elif ref2:
        args.append(ref2)
    else:
        args.append("HEAD")
    result = await asyncio.to_thread(
        subprocess.run, args, cwd=path, capture_output=True, text=True
    )
    entries = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        status_code = parts[0][0] if parts[0] else "X"
        status = GIT_STATUS_MAP.get(status_code, "Unknown")
        # For renames, the last part is the new name
        file_path = parts[-1] if len(parts) > 1 else parts[0]
        entries.append({"path": file_path, "status": status})
    return entries


async def save_snapshot(
    project_id: str, clip_data: str, message: str
) -> dict[str, Any]:
    path = _project_path(project_id)
    (path / "project.json").write_text(clip_data)
    await asyncio.to_thread(_run_git, path, "add", "project.json")
    await asyncio.to_thread(
        _run_git, path, "commit", "-m", message, "--allow-empty"
    )
    result = await asyncio.to_thread(
        subprocess.run,
        ["git", "rev-parse", "HEAD"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return {"commit": result.stdout.strip()}


async def revert(project_id: str, commit_hash: str) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(
        _run_git, path, "revert", "--no-commit", commit_hash
    )
    await asyncio.to_thread(
        _run_git, path, "commit", "-m", f"Revert {commit_hash[:7]}"
    )
    return {"reverted": commit_hash}


async def export_tarball(project_id: str, output_path: str) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(
        _run_git, path, "archive", "--format=tar.gz", "-o", output_path, "HEAD"
    )
    return {"path": output_path}


async def import_tarball(tarball_path: str, project_id: str) -> dict[str, Any]:
    path = _project_path(project_id)
    # Extract tarball into project directory
    await asyncio.to_thread(
        subprocess.run,
        ["tar", "-xzf", tarball_path, "-C", str(path)],
        check=True,
        capture_output=True,
    )
    # Re-init git if needed
    if not (path / ".git").exists():
        await asyncio.to_thread(_run_git, path, "init")
        await asyncio.to_thread(_run_git, path, "add", ".")
        await asyncio.to_thread(
            _run_git, path, "commit", "-m", "Import from tarball"
        )
    return {"project_id": project_id}


async def get_current_branch(project_id: str) -> dict[str, str]:
    path = _project_path(project_id)
    if not (path / ".git").exists():
        return {"branch": "main"}
    result = await asyncio.to_thread(
        subprocess.run,
        ["git", "branch", "--show-current"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    branch = result.stdout.strip()
    return {"branch": branch or "main"}


async def rename_branch(
    project_id: str, old_name: str, new_name: str
) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(
        _run_git, path, "branch", "-m", old_name, new_name
    )
    return {"old": old_name, "new": new_name}


async def fork_from_commit(
    project_id: str, branch: str, commit_hash: str
) -> dict[str, Any]:
    path = _project_path(project_id)
    await asyncio.to_thread(
        _run_git, path, "checkout", "-b", branch, commit_hash
    )
    return {"branch": branch, "from": commit_hash}


async def merge_branch(project_id: str, branch: str) -> dict[str, Any]:
    path = _project_path(project_id)
    try:
        await asyncio.to_thread(
            _run_git, path, "merge", branch, "-m", f"Merge {branch}"
        )
        return {"message": f"Merged '{branch}' successfully"}
    except subprocess.CalledProcessError as e:
        # Attempt to abort merge on conflict
        try:
            await asyncio.to_thread(_run_git, path, "merge", "--abort")
        except Exception:
            pass
        raise RuntimeError(f"Merge failed: {e.stderr or e.stdout or 'conflict'}")


async def get_branch_notes(project_id: str) -> dict[str, Any]:
    path = _project_path(project_id)
    notes_file = path / ".beehive/branch_notes.json"
    if notes_file.exists():
        return json.loads(notes_file.read_text())
    return {}


async def set_branch_notes(
    project_id: str, notes: dict[str, Any]
) -> dict[str, Any]:
    path = _project_path(project_id)
    notes_dir = path / ".beehive"
    notes_dir.mkdir(parents=True, exist_ok=True)
    (notes_dir / "branch_notes.json").write_text(json.dumps(notes))
    return notes


async def read_clips(project_id: str) -> str:
    path = _project_path(project_id)
    project_file = path / "project.json"
    if project_file.exists():
        return project_file.read_text()
    return "[]"


async def read_clips_at(project_id: str, ref_name: str) -> str:
    path = _project_path(project_id)
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            ["git", "show", f"{ref_name}:project.json"],
            cwd=path,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return "[]"
        return result.stdout
    except Exception:
        return "[]"
