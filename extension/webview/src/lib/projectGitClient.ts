const BACKEND_URL = "http://127.0.0.1:9876";

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

async function api(method: string, path: string, body?: object): Promise<any> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export async function initProject(name: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/init`);
  return data.project_id;
}

export async function saveSnapshot(
  name: string,
  clipData: string,
  message: string
): Promise<string> {
  const data = await api("POST", `/projects/${name}/snapshot`, {
    clip_data: clipData,
    message,
  });
  return data.commit;
}

export async function listBranches(name: string): Promise<BranchInfo[]> {
  return api("GET", `/projects/${name}/branches`);
}

export async function createBranch(name: string, branch: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/branches`, { branch });
  return data.branch;
}

export async function checkoutBranch(name: string, branch: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/checkout`, { branch });
  return data.branch;
}

export async function deleteBranch(name: string, branch: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/branches/delete`, { branch });
  return data.deleted;
}

export async function getLog(name: string, count: number = 50): Promise<CommitInfo[]> {
  return api("GET", `/projects/${name}/log?count=${count}`);
}

export async function getDiff(
  name: string,
  ref1?: string | null,
  ref2?: string | null
): Promise<DiffEntry[]> {
  const params = new URLSearchParams();
  if (ref1) params.set("ref1", ref1);
  if (ref2) params.set("ref2", ref2);
  return api("GET", `/projects/${name}/diff?${params}`);
}

export async function revert(name: string, commitHash: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/revert`, { commit_hash: commitHash });
  return data.reverted;
}

export async function exportTarball(name: string, outputPath: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/export`, { output_path: outputPath });
  return data.path;
}

export async function importTarball(tarballPath: string, projectName: string): Promise<string> {
  const data = await api("POST", `/projects/${projectName}/import`, {
    tarball_path: tarballPath,
  });
  return `Imported into project '${data.project_id}'`;
}

export async function getCurrentBranch(name: string): Promise<string> {
  const data = await api("GET", `/projects/${name}/branches/current`);
  return data.branch;
}

export async function ensureProjectInit(name: string): Promise<boolean> {
  try {
    await initProject(name);
    return true;
  } catch {
    return false;
  }
}

export async function renameBranch(
  name: string,
  oldName: string,
  newName: string
): Promise<void> {
  await api("POST", `/projects/${name}/branches/rename`, {
    old_name: oldName,
    new_name: newName,
  });
}

export async function forkFromCommit(
  name: string,
  branch: string,
  commitHash: string
): Promise<void> {
  await api("POST", `/projects/${name}/branches/fork`, {
    branch,
    commit_hash: commitHash,
  });
}

export async function mergeBranch(name: string, branch: string): Promise<string> {
  const data = await api("POST", `/projects/${name}/branches/merge`, { branch });
  return data.message;
}

export async function getBranchNotes(name: string): Promise<Record<string, BranchMeta>> {
  return api("GET", `/projects/${name}/branches/notes`);
}

export async function setBranchNotes(
  name: string,
  notes: Record<string, BranchMeta>
): Promise<void> {
  await api("POST", `/projects/${name}/branches/notes`, { notes });
}

export async function readClips(name: string): Promise<string> {
  const data = await api("GET", `/projects/${name}/clips`);
  return data.data;
}

export async function readClipsAt(name: string, refName: string): Promise<string> {
  const data = await api("GET", `/projects/${name}/clips/at?ref=${encodeURIComponent(refName)}`);
  return data.data;
}
