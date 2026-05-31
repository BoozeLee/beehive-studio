import { invoke } from "@tauri-apps/api/core";

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
}

export interface DiffEntry {
  path: string;
  status: string;
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
