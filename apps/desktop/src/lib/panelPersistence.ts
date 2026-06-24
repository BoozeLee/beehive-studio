import Database from "@tauri-apps/plugin-sql";

const PANEL_KEY = "panel_layout_v1";
const WORKBENCH_KEY = "workbench_state_v1";

export type LeftTab = "project" | "patterns" | "samples" | "git";
export type RightTab = "inspector" | "agents";
export type BottomTab = "agent" | "console" | "problems";

export interface PanelLayout {
  leftRail: { size: number; collapsed: boolean };
  rightRail: { size: number; collapsed: boolean };
  bottomRail: { size: number; collapsed: boolean };
  centerTabs: { activeTab: string };
}

export interface WorkbenchPersistedState {
  panels: {
    left: { open: boolean; activeTab: LeftTab };
    right: { open: boolean; activeTab: RightTab };
    bottom: { open: boolean; activeTab: BottomTab };
  };
  center: { tabs: string[]; activeTab: string };
  activeSessionId?: string;
}

const DEFAULT_LAYOUT: PanelLayout = {
  leftRail: { size: 260, collapsed: false },
  rightRail: { size: 280, collapsed: false },
  bottomRail: { size: 220, collapsed: false },
  centerTabs: { activeTab: "arrangement" },
};

const DEFAULT_WORKBENCH: WorkbenchPersistedState = {
  panels: {
    left: { open: true, activeTab: "project" },
    right: { open: true, activeTab: "agents" },
    bottom: { open: true, activeTab: "agent" },
  },
  center: { tabs: ["arrangement"], activeTab: "arrangement" },
};

async function getDb(): Promise<Database> {
  return Database.load("sqlite:beehive-studio.db");
}

async function ensureTable(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}

export async function loadPanelLayout(): Promise<PanelLayout> {
  try {
    const db = await getDb();
    await ensureTable(db);
    const rows = await db.select<{ value: string }[]>("SELECT value FROM app_settings WHERE key = ?", [PANEL_KEY]);
    if (rows && rows.length > 0) {
      return { ...DEFAULT_LAYOUT, ...JSON.parse(rows[0].value) };
    }
  } catch {
    // Ignore DB errors, fall back to defaults
  }
  return DEFAULT_LAYOUT;
}

export async function savePanelLayout(layout: PanelLayout): Promise<void> {
  try {
    const db = await getDb();
    await ensureTable(db);
    await db.execute(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
      [PANEL_KEY, JSON.stringify(layout)]
    );
  } catch {
    // Ignore DB errors
  }
}

export async function loadWorkbenchState(): Promise<WorkbenchPersistedState> {
  try {
    const db = await getDb();
    await ensureTable(db);
    const rows = await db.select<{ value: string }[]>("SELECT value FROM app_settings WHERE key = ?", [WORKBENCH_KEY]);
    if (rows && rows.length > 0) {
      return { ...DEFAULT_WORKBENCH, ...JSON.parse(rows[0].value) };
    }
  } catch {
    // Ignore DB errors
  }
  return DEFAULT_WORKBENCH;
}

export async function saveWorkbenchState(state: WorkbenchPersistedState): Promise<void> {
  try {
    const db = await getDb();
    await ensureTable(db);
    await db.execute(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
      [WORKBENCH_KEY, JSON.stringify(state)]
    );
  } catch {
    // Ignore DB errors
  }
}

export function debouncedSaveLayout(layout: PanelLayout, _ms = 500): void {
  // Simple debounce — caller manages the timeout ref
  savePanelLayout(layout);
}
