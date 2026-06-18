import { useState, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  listBranches,
  getLog,
  getDiff,
  revert,
  exportTarball,
  importTarball,
  createBranch,
  checkoutBranch,
  deleteBranch,
  renameBranch,
  forkFromCommit,
  mergeBranch,
  getBranchNotes,
  setBranchNotes,
  type BranchInfo,
  type CommitInfo,
  type DiffEntry,
  type BranchMeta,
} from "../lib/projectGit";
import { BranchDiffView } from "./BranchDiffView";
import { GitGraph } from "./GitGraph";

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
  onBranchSwitch?: (branch: string) => void;
}

type Tab = "branches" | "history" | "compare";

export function ProjectPanel({ projectName, visible, onClose, onBranchSwitch }: Props) {
  const [tab, setTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [status, setStatus] = useState("");
  const [statusColor, setStatusColor] = useState(COLORS.textMuted);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [branchNotes, setBranchNotesState] = useState<Record<string, BranchMeta>>({});
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

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
      if (b.length > 0) {
        const current = b.find((br) => br.is_current);
        const other = b.find((br) => !br.is_current);
        setCompareA(current?.name || b[0].name);
        setCompareB(other?.name || b[0].name);
      }
      try {
        const notes = await getBranchNotes(projectName);
        setBranchNotesState(notes);
      } catch {}
    } catch (e) {
      setStatus(`Load failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleSwitchBranch(name: string) {
    try {
      await checkoutBranch(projectName, name);
      await loadData();
      onBranchSwitch?.(name);
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

  async function handleForkFromCommit(commitHash: string) {
    const name = prompt("New branch name:", `from-${commitHash.slice(0, 7)}`);
    if (!name) return;
    try {
      await forkFromCommit(projectName, name, commitHash);
      await loadData();
      onBranchSwitch?.(name);
      setStatus(`Forked '${name}' from ${commitHash.slice(0, 7)}`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Fork failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleRenameBranch(oldName: string, newName: string) {
    if (!newName.trim() || newName === oldName) return;
    try {
      await renameBranch(projectName, oldName, newName);
      await loadData();
      setStatus(`Renamed to '${newName}'`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Rename failed: ${e}`);
      setStatusColor(COLORS.error);
    }
    setRenaming(null);
  }

  async function handleDeleteBranch(branch: string) {
    if (!confirm(`Delete branch '${branch}'?`)) return;
    try {
      await deleteBranch(projectName, branch);
      await loadData();
      setStatus(`Deleted '${branch}'`);
      setStatusColor(COLORS.success);
    } catch (e) {
      setStatus(`Delete failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function handleMergeBranch(source: string) {
    if (!confirm(`Merge '${source}' into current branch?`)) return;
    try {
      const result = await mergeBranch(projectName, source);
      setStatus(result);
      setStatusColor(COLORS.success);
      await loadData();
    } catch (e) {
      setStatus(`Merge failed: ${e}`);
      setStatusColor(COLORS.error);
    }
  }

  async function saveBranchNotes(branch: string, description: string) {
    const updated = { ...branchNotes, [branch]: { description, created_at: Math.floor(Date.now() / 1000) } };
    try {
      await setBranchNotes(projectName, updated);
      setBranchNotesState(updated);
    } catch (e) {
      setStatus(`Notes save failed: ${e}`);
      setStatusColor(COLORS.error);
    }
    setEditingNotes(null);
  }

  async function handleExport() {
    try {
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
        width: 340,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
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

      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
        <button onClick={() => setTab("branches")} style={tabStyle("branches")}>Branches</button>
        <button onClick={() => setTab("history")} style={tabStyle("history")}>History</button>
        <button onClick={() => setTab("compare")} style={tabStyle("compare")}>Compare</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {/* ── Branches Tab ── */}
        {tab === "branches" && (
          <div>
            {branches.map((b) => (
              <div
                key={b.name}
                style={{
                  padding: "6px 8px",
                  borderRadius: 4,
                  marginBottom: 2,
                  background: b.is_current ? "#2a2a30" : "transparent",
                  borderLeft: b.is_current ? `3px solid ${COLORS.accent}` : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renaming === b.name ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameBranch(b.name, renameValue);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={() => setRenaming(null)}
                        style={{
                          padding: "2px 4px",
                          fontSize: 12,
                          background: COLORS.bg,
                          color: COLORS.text,
                          border: `1px solid ${COLORS.accent}`,
                          borderRadius: 3,
                          width: "100%",
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => {
                          if (!b.is_current) { setRenaming(b.name); setRenameValue(b.name); }
                        }}
                        style={{
                          fontSize: 13,
                          color: b.is_current ? COLORS.accent : COLORS.text,
                          cursor: b.is_current ? "default" : "pointer",
                          fontWeight: b.is_current ? 600 : 400,
                        }}
                      >
                        {b.is_current ? "● " : "○ "}
                        {b.name}
                      </div>
                    )}
                    {editingNotes === b.name ? (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <input
                          autoFocus
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveBranchNotes(b.name, notesValue);
                            if (e.key === "Escape") setEditingNotes(null);
                          }}
                          placeholder="Branch description..."
                          style={{
                            flex: 1,
                            padding: "2px 4px",
                            fontSize: 11,
                            background: COLORS.bg,
                            color: COLORS.text,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 3,
                          }}
                        />
                        <button onClick={() => saveBranchNotes(b.name, notesValue)} style={{ padding: "2px 6px", fontSize: 10, background: COLORS.accent, color: "#000", border: "none", borderRadius: 3, cursor: "pointer" }}>✓</button>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setEditingNotes(b.name); setNotesValue(branchNotes[b.name]?.description || ""); }}
                        style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, cursor: "pointer" }}
                      >
                        {branchNotes[b.name]?.description || "(add description)"}
                      </div>
                    )}
                  </div>
                  {!b.is_current && (
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginLeft: 6 }}>
                      <ActBtn label="Switch" onClick={() => handleSwitchBranch(b.name)} />
                      <ActBtn label="Fork" onClick={() => {
                        const name = prompt("Fork branch name:", `${b.name}-copy`);
                        if (name) handleForkFromCommit(`refs/heads/${b.name}`).then(() => {
                          createBranch(projectName, name).then(() => handleSwitchBranch(name));
                        });
                      }} />
                      <ActBtn label="Merge" onClick={() => handleMergeBranch(b.name)} />
                      <ActBtn label="✕" onClick={() => handleDeleteBranch(b.name)} color={COLORS.error} />
                    </div>
                  )}
                </div>
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
        )}

        {/* ── History Tab ── */}
        {tab === "history" && (
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
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: COLORS.accent }}>
                    Diff ({selectedCommit.slice(0, 7)})
                  </span>
                  <button
                    onClick={() => { setDiffEntries([]); setSelectedCommit(null); }}
                    style={{
                      padding: "1px 4px",
                      fontSize: 10, background: "transparent", border: "none",
                      color: COLORS.textMuted, cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
                {diffEntries.map((d, i) => (
                  <div key={i} style={{ fontSize: 11, color: COLORS.text, marginBottom: 2 }}>
                    <span style={{
                      color: d.status === "Modified" ? COLORS.warning
                        : d.status === "Added" ? COLORS.success : COLORS.error,
                    }}>
                      [{d.status}]
                    </span> {d.path}
                  </div>
                ))}
              </div>
            )}

            <GitGraph
              commits={commits}
              selectedHash={selectedCommit}
              onCommitClick={(hash) => handleShowDiff(hash)}
            />

            {selectedCommit && (
              <div style={{ display: "flex", gap: 4, marginTop: 8, padding: "0 8px" }}>
                <button
                  onClick={() => handleRevert(selectedCommit)}
                  style={{
                    padding: "4px 10px", fontSize: 11,
                    background: COLORS.error, color: "#fff",
                    border: "none", borderRadius: 4, cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Revert to this state
                </button>
                <button
                  onClick={() => handleForkFromCommit(selectedCommit)}
                  style={{
                    padding: "4px 10px", fontSize: 11,
                    background: COLORS.accent, color: "#000",
                    border: "none", borderRadius: 4, cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Fork from here
                </button>
              </div>
            )}

            {commits.length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 }}>
                No commits yet. Save the project to create the first commit.
              </div>
            )}
          </div>
        )}

        {/* ── Compare Tab ── */}
        {tab === "compare" && (
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                style={{
                  flex: 1, padding: "4px 6px", fontSize: 12,
                  background: COLORS.bg, color: COLORS.text,
                  border: `1px solid ${COLORS.border}`, borderRadius: 4,
                }}
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              <span style={{ color: COLORS.textMuted, alignSelf: "center" }}>vs</span>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                style={{
                  flex: 1, padding: "4px 6px", fontSize: 12,
                  background: COLORS.bg, color: COLORS.text,
                  border: `1px solid ${COLORS.border}`, borderRadius: 4,
                }}
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            {compareA && compareB && compareA !== compareB ? (
              <BranchDiffView projectName={projectName} branchA={compareA} branchB={compareB} />
            ) : (
              <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", padding: 20 }}>
                Select two different branches to compare.
              </div>
            )}
          </div>
        )}
      </div>

      {status && (
        <div style={{
          padding: "4px 10px", fontSize: 11, color: statusColor,
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          {status}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, padding: 8, borderTop: `1px solid ${COLORS.border}` }}>
        <button onClick={handleExport} style={{
          flex: 1, padding: "4px 0", fontSize: 11,
          background: COLORS.bg, color: COLORS.text,
          border: `1px solid ${COLORS.border}`, borderRadius: 4, cursor: "pointer",
        }}>
          Export
        </button>
        <button onClick={handleImport} style={{
          flex: 1, padding: "4px 0", fontSize: 11,
          background: COLORS.bg, color: COLORS.text,
          border: `1px solid ${COLORS.border}`, borderRadius: 4, cursor: "pointer",
        }}>
          Import
        </button>
      </div>
    </div>
  );
}

function ActBtn({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "2px 6px", fontSize: 10,
        background: "transparent",
        border: `1px solid ${color || COLORS.border}`,
        color: color || COLORS.textMuted,
        borderRadius: 3, cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
