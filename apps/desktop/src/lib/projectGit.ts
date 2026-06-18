import { invoke } from "@tauri-apps/api/core";

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;
  parents: string[];
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
}

export interface DiffEntry {
  path: string;
  status: string;
}

export interface BranchMeta {
  description?: string;
  created_at?: number;
}

export interface ClipDiffEntry {
  id: string;
  name: string;
  status: "added" | "removed" | "modified";
  old_name?: string;
}

let knownProjects = new Set<string>();

export async function initProject(name: string): Promise<string> {
  const result = await invoke<string>("git_init_project", { name });
  knownProjects.add(name);
  return result;
}

export async function saveSnapshot(
  name: string,
  clipData: string,
  message: string,
): Promise<string> {
  const result = await invoke<string>("git_save_snapshot", {
    name,
    clipData,
    message,
  });
  knownProjects.add(name);
  return result;
}

export async function listBranches(name: string): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>("git_list_branches", { name });
}

export async function createBranch(name: string, branch: string): Promise<string> {
  return invoke<string>("git_create_branch", { name, branch });
}

export async function checkoutBranch(name: string, branch: string): Promise<string> {
  return invoke<string>("git_checkout_branch", { name, branch });
}

export async function getLog(name: string, count: number = 50): Promise<CommitInfo[]> {
  return invoke<CommitInfo[]>("git_log", { name, count });
}

export async function getDiff(
  name: string,
  ref1?: string | null,
  ref2?: string | null,
): Promise<DiffEntry[]> {
  return invoke<DiffEntry[]>("git_diff", {
    name,
    ref1: ref1 ?? null,
    ref2: ref2 ?? null,
  });
}

export async function revert(name: string, commitHash: string): Promise<string> {
  return invoke<string>("git_revert", { name, commitHash });
}

export async function exportTarball(name: string, outputPath: string): Promise<string> {
  return invoke<string>("git_export_tarball", { name, outputPath });
}

export async function importTarball(tarballPath: string, projectName: string): Promise<string> {
  return invoke<string>("git_import_tarball", { tarballPath, projectName });
}

export async function getCurrentBranch(name: string): Promise<string> {
  return invoke<string>("git_current_branch", { name });
}

export async function ensureProjectInit(name: string): Promise<boolean> {
  if (knownProjects.has(name)) return true;
  try {
    await initProject(name);
    return true;
  } catch {
    return false;
  }
}

// Phase 4.2 — Fork/Branch Creative UX

export async function forkSession(
  name: string,
  branchName: string,
  clipData: string,
  message: string,
): Promise<string> {
  return invoke<string>("git_fork_session", {
    name,
    branchName,
    clipData,
    message,
  });
}

export async function forkFromCommit(
  name: string,
  branchName: string,
  commitHash: string,
): Promise<string> {
  return invoke<string>("git_fork_from_commit", {
    name,
    branchName,
    commitHash,
  });
}

export async function readClips(name: string): Promise<string> {
  return invoke<string>("git_read_clips", { name });
}

export async function readClipsAt(name: string, refName: string): Promise<string> {
  return invoke<string>("git_read_clips_at", { name, refName });
}

export async function mergeBranch(
  name: string,
  sourceBranch: string,
): Promise<string> {
  return invoke<string>("git_merge_branch", { name, sourceBranch });
}

export async function deleteBranch(name: string, branch: string): Promise<string> {
  return invoke<string>("git_delete_branch", { name, branch });
}

export async function renameBranch(
  name: string,
  oldName: string,
  newName: string,
): Promise<string> {
  return invoke<string>("git_rename_branch", { name, oldName, newName });
}

export async function getBranchNotes(name: string): Promise<Record<string, BranchMeta>> {
  const raw = await invoke<string>("git_branch_notes", {
    name,
    notesJson: null,
  });
  return JSON.parse(raw);
}

export async function setBranchNotes(
  name: string,
  notes: Record<string, BranchMeta>,
): Promise<Record<string, BranchMeta>> {
  const raw = await invoke<string>("git_branch_notes", {
    name,
    notesJson: JSON.stringify(notes),
  });
  return JSON.parse(raw);
}

export async function getBranchLog(
  name: string,
  branch: string,
  count: number = 50,
): Promise<CommitInfo[]> {
  return invoke<CommitInfo[]>("git_log_for_branch", { name, branch, count });
}

/**
 * Phase B: Neural Git & Musical Content Addressing
 */
export async function getClipHash(clipData: string): Promise<string> {
  return invoke<string>("git_hash_object", { data: clipData });
}

export async function tagCommit(name: string, tagName: string, message: string): Promise<string> {
  return invoke<string>("git_tag", { name, tagName, message });
}
