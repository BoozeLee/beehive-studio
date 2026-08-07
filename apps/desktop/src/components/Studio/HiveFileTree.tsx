"use client";

import React, { useEffect, useState } from "react";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children: TreeNode[];
}

interface Props {
  onOpenFile?: (path: string, content: string) => void;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const p of paths) {
    const parts = p.split("/");
    let nodes = root;
    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
      const isFile = i === parts.length - 1;
      let existing = nodes.find((n) => n.name === parts[i]);
      if (!existing) {
        existing = { name: parts[i], path: accumulated, type: isFile ? "file" : "dir", children: [] };
        nodes.push(existing);
      }
      if (!isFile) nodes = existing.children;
    }
  }
  return root;
}

function TreeNodeView({
  node,
  depth,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  onOpenFile?: (path: string, content: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const pl = 6 + depth * 12;

  if (node.type === "dir") {
    return (
      <div>
        <div
          className="flex items-center gap-1 text-xs cursor-pointer py-0.5 rounded hover:bg-[var(--bh-panel-hover)] select-none"
          style={{ paddingLeft: pl, color: "var(--bh-text-muted)" }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-[10px] w-3" style={{ color: "var(--bh-text-faint)" }}>{open ? "▼" : "▶"}</span>
          <span>📁 {node.name}</span>
        </div>
        {open && node.children.map((c) => (
          <TreeNodeView key={c.path} node={c} depth={depth + 1} onOpenFile={onOpenFile} />
        ))}
      </div>
    );
  }

  const loadFile = async () => {
    try {
      const res = await fetch("/tools/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: node.path }),
      });
      const json = await res.json();
      onOpenFile?.(node.path, json.content ?? "");
    } catch { /* backend offline */ }
  };

  return (
    <div
      className="text-xs cursor-pointer py-0.5 rounded hover:bg-[var(--bh-panel-hover)]"
      style={{ paddingLeft: pl + 16, color: "var(--bh-text-muted)" }}
      onClick={loadFile}
    >
      📄 {node.name}
    </div>
  );
}

export function HiveFileTree({ onOpenFile }: Props = {}) {
  const [tree, setTree] = useState<TreeNode[]>([]);

  const refresh = () => {
    fetch("/tools/files")
      .then((r) => r.json())
      .then((j) => setTree(buildTree(j.files ?? [])))
      .catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("hive:refresh-files", handler);
    return () => window.removeEventListener("hive:refresh-files", handler);
  }, []);

  return (
    <div className="h-full overflow-y-auto bh-scrollable p-2" style={{ background: "var(--bh-panel)", borderRight: "1px solid var(--bh-border)" }}>
      {tree.length === 0 && (
        <div className="text-xs px-2 py-4" style={{ color: "var(--bh-text-faint)" }}>No files found</div>
      )}
      {tree.map((n) => (
        <TreeNodeView key={n.path} node={n} depth={0} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}
