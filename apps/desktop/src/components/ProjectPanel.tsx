import { useState, useEffect } from "react";
import {
  listBranches,
  getLog,
  getDiff,
  revert,
  exportTarball,
  importTarball,
  createBranch,
  checkoutBranch,
  type BranchInfo,
  type CommitInfo,
  type DiffEntry,
} from "../lib/projectGit";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  accentDim: "#cc7035",
  text: "#e0e0e0",
  textMuted: "#888",
  success: "#4ade80",
  error: "#ef4444",
  warning: "#fbbf24",
};

interface Props {
  projectName: string;
  visible: boolean;
  onClose: () => void;
}

type Tab = "branches" | "history";

export function ProjectPanel({ projectName, visible, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [status, setStatus] = useState("");
  const [statusColor, setStatusColor] = useState(COLORS.textMuted);

  useEffect(() => {
    if (!visible || !projectName) return;
    loadData();
  }, [visible, projectName]);

  async function loadData() {
    try {
      const [b, c] = await Promise.all([
        listBranches(projectName),
        getLog(projectName, 50),
      ]);
      setBranches(b);
      setCommits(c);
    } catch (e) {
      setStatus(`Load failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleSwitchBranch(name: string) {
    try {
      await checkoutBranch(projectName, name);
      await loadData();
      setStatus(`Switched to ${name}`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Switch failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    try {
      await createBranch(projectName, name);
      await loadData();
      setNewBranchName("");
      setStatus(`Created ${name}`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Create failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleShowDiff(commitHash: string) {
    setSelectedCommit(commitHash);
    try {
      const entries = await getDiff(projectName, `${commitHash}^`, commitHash);
      setDiffEntries(entries);
    } catch {
      try {
        const entries = await getDiff(projectName, null, commitHash);
        setDiffEntries(entries);
      } catch (e) {
        setDiffEntries([]);
        setStatus(`Diff failed: ${e}`);
        setStatusColor(COLORS.error);
      }
    }
  }

  async function handleRevert(commitHash: string) {
    try {
      await revert(projectName, commitHash);
      setStatus(`Reverted to ${commitHash.slice(0, 7)}`);
      setStatusColor(COLORS.success);
      await loadData();
    } catch (e) {
      setStatus(`Revert failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleExport() {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const savePath = await save({
        defaultPath: `${projectName}.beehive.tar.gz`,
        filters: [{ name: "Beehive Archive", extensions: ["tar.gz"] }],
      });
      if (!savePath) return;
      setStatus("Exporting...");
      setStatusColor(COLORS.warning);
      const result = await exportTarball(projectName, savePath);
      setStatus(`Exported to ${result}`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Export failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleImport() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        filters: [{ name: "Beehive Archive", extensions: ["tar.gz"] }],
      });
      if (!filePath) return;
      setStatus("Importing...");
      setStatusColor(COLORS.warning);
      const result = await importTarball(filePath as string, projectName);
      setStatus(result);
      setStatusColor(COLORS.success);
      await loadData();
    } catch (e) {
      setStatus(`Import failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  if (!visible) return null;

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1,
    padding: "6px 0",
    fontSize: 12,
    fontWeight: 600,
    background: tab === t ? COLORS.bg : "transparent",
    color: tab === t ? COLORS.accent : COLORS.textMuted,
    border: "none",
    borderBottom: tab === t ? `2px solid ${COLORS.accent}` : `2px solid transparent`,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div
      style={{
        width: 320,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent }}>
          ⎇ Project Git
        </span>
        <button
          onClick={onClose}
          style={{
            padding: "2px 8px",
            fontSize: 14,
            background: "transparent",
            border: "none",
            color: COLORS.textMuted,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={() => setTab("branches")} style={tabStyle("branches")}>
          Branches
        </button>
        <button onClick={() => setTab("history")} style={tabStyle("history")}>
          History
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {tab === "branches" ? (
          <div>
            {branches.map((b) => (
              <div
                key={b.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 8px",
                  borderRadius: 4,
                  marginBottom: 2,
                  background: b.is_current ? "#2a2a30" : "transparent",
                }}
              >
                <span style={{ fontSize: 13, color: b.is_current ? COLORS.accent : COLORS.text }}>
                  {b.is_current ? "● " : "○ "}
                  {b.name}
                </span>
                {!b.is_current && (
                  <button
                    onClick={() => handleSwitchBranch(b.name)}
                    style={{
                      padding: "2px 8px",
                      fontSize: 11,
                      background: "transparent",
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
                placeholder="New branch name"
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 12,
                  background: COLORS.bg,
                  color: COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                }}
              />
              <button
                onClick={handleCreateBranch}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  background: COLORS.accent,
                  color: "#000",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div>
            {diffEntries.length > 0 && selectedCommit && (
              <div
                style={{
                  background: COLORS.bg,
                  borderRadius: 4,
                  padding: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11, color: COLORS.accent }}>
                    Diff ({selectedCommit.slice(0, 7)})
                  </span>
                  <button
                    onClick={() => { setDiffEntries([]); setSelectedCommit(null); }}
                    style={{
                      padding: "1px 4px",
                      fontSize: 10,
                      background: "transparent",
                      border: "none",
                      color: COLORS.textMuted,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
                {diffEntries.map((d, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 11, color: COLORS.text, marginBottom: 2 }}
                  >
                    <span
                      style={{
                        color:
                          d.status === "Modified"
                            ? COLORS.warning
                            : d.status === "Added"
                              ? COLORS.success
                              : COLORS.error,
                      }}
                    >
                      [{d.status}]
                    </span>{" "}
                    {d.path}
                  </div>
                ))}
              </div>
            )}

            {commits.map((c) => (
              <div
                key={c.hash}
                style={{
                  padding: "6px 8px",
                  borderRadius: 4,
                  marginBottom: 2,
                  cursor: "pointer",
                  background:
                    selectedCommit === c.hash ? "#2a2a30" : "transparent",
                }}
                onClick={() => handleShowDiff(c.hash)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: COLORS.text }}>
                    {c.message.split("\n")[0]}
                  </span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "monospace" }}>
                    {c.short_hash}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                  <span>{c.author}</span>
                  <span>{new Date(c.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                {selectedCommit === c.hash && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRevert(c.hash); }}
                    style={{
                      marginTop: 4,
                      padding: "2px 8px",
                      fontSize: 10,
                      background: COLORS.error,
                      color: "#fff",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    Revert
                  </button>
                )}
              </div>
            ))}

            {commits.length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 }}>
                No commits yet. Save the project to create the first commit.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      {status && (
        <div
          style={{
            padding: "4px 10px",
            fontSize: 11,
            color: statusColor,
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          {status}
        </div>
      )}

      {/* Import / Export */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 8,
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        <button
          onClick={handleExport}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: 11,
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Export
        </button>
        <button
          onClick={handleImport}
          style={{
            flex: 1,
            padding: "4px 0",
            fontSize: 11,
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Import
        </button>
      </div>
    </div>
  );
}
