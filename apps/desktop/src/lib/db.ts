import Database from "@tauri-apps/plugin-sql";
import { parseProjectDocument, type ProjectDocumentV2 } from "./arrangementAdapter";

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

  try {
    await db.execute("ALTER TABLE projects ADD COLUMN document_json TEXT");
  } catch {
    // Existing databases already have this column after the first 3A.2 save.
  }

  return db;
}

export async function saveProject(name: string, documentJson: string): Promise<void> {
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
      "UPDATE projects SET updated_at = CURRENT_TIMESTAMP, document_json = ? WHERE id = ?",
      [documentJson, projectId]
    );
    // Delete old clips
    await db.execute("DELETE FROM clips WHERE project_id = ?", [projectId]);
  } else {
    const result = await db.execute("INSERT INTO projects (name, document_json) VALUES (?, ?)", [
      name,
      documentJson,
    ]);
    projectId = result.lastInsertId ?? 0;
  }

  const document = parseProjectDocument(documentJson);
  for (const clip of document.clips) {
    const midiData = JSON.stringify(clip.midiData ?? {});
    const reasoning = (clip.reasoning ?? []).join("\n");
    await db.execute(
      "INSERT INTO clips (project_id, name, midi_data, reasoning) VALUES (?, ?, ?, ?)",
      [projectId, clip.name, midiData, reasoning]
    );
  }
}

export async function loadProject(name: string): Promise<ProjectDocumentV2> {
  const db = await initDb();

  const projects = await db.select<{ id: number; document_json: string | null }[]>(
    "SELECT id, document_json FROM projects WHERE name = ?",
    [name]
  );

  if (!projects || projects.length === 0) return parseProjectDocument([]);
  if (projects[0].document_json) return parseProjectDocument(projects[0].document_json);
  const projectId = projects[0].id;

  const rows = await db.select<{ name: string; midi_data: string; reasoning: string }[]>(
    "SELECT name, midi_data, reasoning FROM clips WHERE project_id = ?",
    [projectId]
  );

  if (!rows) return parseProjectDocument([]);

  return parseProjectDocument(rows.map((row, idx) => {
    const midiData = JSON.parse(row.midi_data || "{}");
    const reasoning = row.reasoning ? row.reasoning.split("\n") : [];
    return {
      id: `db-${idx}`,
      name: row.name,
      midiData: midiData,
      reasoning: reasoning,
    };
  }));
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
