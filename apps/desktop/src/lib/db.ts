import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;
  // sqlite:// prefix tells Tauri to use the SQL plugin with SQLite
  db = await Database.load("sqlite:beehive-studio.db");

  // Create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT,
      midi_data TEXT,
      reasoning TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  return db;
}

export async function saveProject(name: string, clips: any[]): Promise<void> {
  const db = await initDb();

  // Check if project exists
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM projects WHERE name = ?",
    [name]
  );

  let projectId: number;
  if (existing && existing.length > 0) {
    projectId = existing[0].id;
    await db.execute(
      "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [projectId]
    );
    // Delete old clips
    await db.execute("DELETE FROM clips WHERE project_id = ?", [projectId]);
  } else {
    const result = await db.execute("INSERT INTO projects (name) VALUES (?)", [name]);
    projectId = result.lastInsertId ?? 0;
  }

  // Insert clips
  for (const clip of clips) {
    const midiData = JSON.stringify(clip.midiData ?? {});
    const reasoning = (clip.reasoning ?? []).join("\n");
    await db.execute(
      "INSERT INTO clips (project_id, name, midi_data, reasoning) VALUES (?, ?, ?, ?)",
      [projectId, clip.name, midiData, reasoning]
    );
  }
}

export async function loadProject(name: string): Promise<any[]> {
  const db = await initDb();

  const projects = await db.select<{ id: number }[]>(
    "SELECT id FROM projects WHERE name = ?",
    [name]
  );

  if (!projects || projects.length === 0) return [];
  const projectId = projects[0].id;

  const rows = await db.select<{ name: string; midi_data: string; reasoning: string }[]>(
    "SELECT name, midi_data, reasoning FROM clips WHERE project_id = ?",
    [projectId]
  );

  if (!rows) return [];

  return rows.map((row, idx) => {
    const midiData = JSON.parse(row.midi_data || "{}");
    const reasoning = row.reasoning ? row.reasoning.split("\n") : [];
    return {
      id: `db-${idx}`,
      name: row.name,
      midiData: midiData,
      reasoning: reasoning,
    };
  });
}

export async function listProjects(): Promise<string[]> {
  const db = await initDb();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM projects ORDER BY updated_at DESC"
  );
  if (!rows) return [];
  return rows.map((r) => r.name);
}

export async function deleteProject(name: string): Promise<void> {
  const db = await initDb();
  await db.execute("DELETE FROM projects WHERE name = ?", [name]);
}
