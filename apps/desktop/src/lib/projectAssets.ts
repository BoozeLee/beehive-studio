import { invoke } from "@tauri-apps/api/core";
import type { Clip, ID } from "../../../../packages/core-models/index";

export async function resolveProjectAsset(projectName: string, path: string): Promise<string> {
  return invoke<string>("resolve_project_asset", { projectName, path });
}

export async function consolidateProjectAssets(
  projectName: string,
  clips: Record<ID, Clip>
): Promise<{ clips: Record<ID, Clip>; count: number }> {
  const paths = [...new Set(
    Object.values(clips)
      .map((clip) => clip.audioFilePath)
      .filter((path): path is string => Boolean(path))
      .filter((path) => path.startsWith("/"))
  )];
  if (paths.length === 0) return { clips, count: 0 };

  const relinked = await invoke<Record<string, string>>("consolidate_project_assets", {
    projectName,
    paths,
  });
  return {
    clips: Object.fromEntries(
      Object.entries(clips).map(([id, clip]) => [
        id,
        clip.audioFilePath && relinked[clip.audioFilePath]
          ? { ...clip, audioFilePath: relinked[clip.audioFilePath], updatedAt: Date.now() / 1000 }
          : clip,
      ])
    ),
    count: Object.keys(relinked).length,
  };
}
