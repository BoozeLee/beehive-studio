import { useState, useEffect, useRef } from "react";
import {
  getCurrentBranch,
  listBranches,
  createBranch,
  checkoutBranch,
  type BranchInfo,
} from "../../lib/projectGitClient";
import { BEEHIVE } from "../../lib/theme";

interface Props {
  projectName: string;
  disabled?: boolean;
  onBranchChange?: (branch: string) => void;
}

export function BranchSelector({ projectName, disabled, onBranchChange }: Props) {
  const [currentBranch, setCurrentBranch] = useState("");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectName || disabled) return;
    loadBranches();
  }, [projectName, disabled]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function loadBranches() {
    try {
      const [cur, list] = await Promise.all([
        getCurrentBranch(projectName),
        listBranches(projectName),
      ]);
      setCurrentBranch(cur);
      setBranches(list);
    } catch {}
  }

  async function handleSwitch(branch: string) {
    try {
      await checkoutBranch(projectName, branch);
      setCurrentBranch(branch);
      setOpen(false);
      onBranchChange?.(branch);
    } catch (e) {
      console.error("Branch switch failed:", e);
    }
  }

  async function handleCreate() {
    const name = newBranchName.trim();
    if (!name) return;
    try {
      await createBranch(projectName, name);
      await loadBranches();
      setNewBranchName("");
      setCreating(false);
    } catch (e) {
      console.error("Branch create failed:", e);
    }
  }

  if (disabled || !projectName) {
    return (
      <span style={{ color: BEEHIVE.textMuted, fontSize: 13, padding: "4px 8px" }}>
        main
      </span>
    );
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "4px 10px",
          fontSize: 13,
          background: BEEHIVE.panel,
          color: BEEHIVE.text,
          border: `1px solid ${BEEHIVE.border}`,
          borderRadius: 4,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: BEEHIVE.comb }}>⎇</span>
        {currentBranch || "main"}
        <span style={{ fontSize: 10, color: BEEHIVE.textMuted }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth: 200,
            background: BEEHIVE.panel,
            border: `1px solid ${BEEHIVE.border}`,
            borderRadius: 6,
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ padding: "6px 10px", fontSize: 11, color: BEEHIVE.textMuted }}>
            Branches
          </div>
          {branches.map((b) => (
            <div
              key={b.name}
              onClick={() => handleSwitch(b.name)}
              style={{
                padding: "5px 10px",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: b.is_current ? "#2a2a30" : "transparent",
                color: b.is_current ? BEEHIVE.comb : BEEHIVE.text,
              }}
              onMouseEnter={(e) => {
                if (!b.is_current) e.currentTarget.style.background = "#222228";
              }}
              onMouseLeave={(e) => {
                if (!b.is_current) e.currentTarget.style.background = "transparent";
              }}
            >
              <span>{b.is_current ? "●" : "○"}</span>
              {b.name}
            </div>
          ))}

          {creating ? (
            <div style={{ padding: "6px 10px", display: "flex", gap: 4 }}>
              <input
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Branch name"
                style={{
                  flex: 1,
                  padding: "3px 6px",
                  fontSize: 12,
                  background: BEEHIVE.bg,
                  color: BEEHIVE.text,
                  border: `1px solid ${BEEHIVE.border}`,
                  borderRadius: 3,
                }}
              />
              <button
                onClick={handleCreate}
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  background: BEEHIVE.comb,
                  color: "#000",
                  border: "none",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                ✓
              </button>
              <button
                onClick={() => { setCreating(false); setNewBranchName(""); }}
                style={{
                  padding: "3px 6px",
                  fontSize: 11,
                  background: "transparent",
                  color: BEEHIVE.textMuted,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              onClick={() => setCreating(true)}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                color: BEEHIVE.amber,
                cursor: "pointer",
                borderTop: `1px solid ${BEEHIVE.border}`,
              }}
            >
              + New Branch
            </div>
          )}
        </div>
      )}
    </div>
  );
}
