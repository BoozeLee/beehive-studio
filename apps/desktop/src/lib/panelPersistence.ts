import Database from "@tauri-apps/plugin-sql";

const PANEL_KEY = "panel_layout_v1";

export interface PanelLayout {
  leftRail: { size: number; collapsed: boolean };
  rightRail: { size: number; collapsed: boolean };
  bottomRail: { size: number; collapsed: boolean };
  centerTabs: { activeTab: string };
}

const DEFAULT_LAYOUT: PanelLayout = {
  leftRail: { size: 260, collapsed: false },
  rightRail: { size: 280, collapsed: false },
  bottomRail: { size: 200, collapsed: false },
  centerTabs: { activeTab: "arrangement" },
};

async function getDb(): Promise<Database> {
  return Database.load("sqlite:beehive-studio.db");
}

export async function loadPanelLayout(): Promise<PanelLayout> {
  try {
    const db = await getDb();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = ?",
      [PANEL_KEY]
    );
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
    await db.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    await db.execute(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
      [PANEL_KEY, JSON.stringify(layout)]
    );
  } catch {
    // Ignore DB errors
  }
}

export function debouncedSaveLayout(layout: PanelLayout, ms = 500): void {
  // Simple debounce — caller manages the timeout ref
  savePanelLayout(layout);
}
