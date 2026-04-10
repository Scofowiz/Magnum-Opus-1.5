import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Project } from "./src/domain/types.js";

const DATA_DIR = path.join(process.cwd(), ".novawrite-data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "novawrite.db");
const TXLOG_DIR = path.join(DATA_DIR, "txlog");
if (!fs.existsSync(TXLOG_DIR)) {
  fs.mkdirSync(TXLOG_DIR, { recursive: true });
}

// ============================================================================
// TRANSACTION LOG - Append-only log for crash recovery (Layer 1)
// Like financial transaction logs: write here FIRST before anything else
// ============================================================================

interface TxLogEntry {
  ts: number; // Timestamp in ms
  op: "save" | "restore" | "delete" | "generated_draft" | "resolve_draft";
  chapterId: string;
  content: string;
  wordCount: number;
  trigger: string;
  seq: number; // Sequence number for ordering
}

interface ChapterVersionRow {
  id: number;
  chapter_id: string;
  content: string;
  word_count: number;
  trigger: string | null;
  created_at: string;
}

interface SessionSnapshotRow {
  id: number;
  session_id: string;
  session_data: string;
  chapter_id: string;
  words_generated: number;
  created_at: string;
}

interface GeneratedDraftRow {
  id: string;
  project_id: string;
  chapter_id: string;
  source: string;
  draft_text: string;
  word_count: number;
  prompt: string | null;
  metadata: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SessionSnapshotRecord extends Omit<
  SessionSnapshotRow,
  "session_data"
> {
  sessionData: unknown;
}

export interface GeneratedDraftRecord {
  id: string;
  projectId: string;
  chapterId: string;
  source: string;
  text: string;
  wordCount: number;
  prompt?: string;
  metadata?: Record<string, unknown>;
  status: "pending" | "persisted" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  title: string;
  content: string;
  story_bible: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface DatabaseProjectRow extends Omit<
  ProjectRow,
  "story_bible" | "word_count"
> {
  storyBible: Project["storyBible"];
  wordCount: number;
}

interface ChapterRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  word_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

let txSeq = 0;

function getTxLogPath(): string {
  const date = new Date().toISOString().split("T")[0];
  return path.join(TXLOG_DIR, `txlog-${date}.jsonl`);
}

// Write to transaction log FIRST (append-only, sync)
function writeTxLog(entry: Omit<TxLogEntry, "ts" | "seq">): void {
  const fullEntry: TxLogEntry = {
    ...entry,
    ts: Date.now(),
    seq: ++txSeq,
  };
  const line = JSON.stringify(fullEntry) + "\n";
  fs.appendFileSync(getTxLogPath(), line, { flag: "a" });
  // Force fsync to ensure it hits disk
  const fd = fs.openSync(getTxLogPath(), "r");
  fs.fsyncSync(fd);
  fs.closeSync(fd);
}

// Replay transaction log for recovery (use after crash)
export function replayTxLog(fromDate?: string): TxLogEntry[] {
  const entries: TxLogEntry[] = [];
  const files = fs
    .readdirSync(TXLOG_DIR)
    .filter((f) => f.startsWith("txlog-") && f.endsWith(".jsonl"))
    .sort();

  for (const file of files) {
    if (fromDate && file < `txlog-${fromDate}`) continue;
    const content = fs.readFileSync(path.join(TXLOG_DIR, file), "utf-8");
    for (const line of content.split("\n")) {
      if (line.trim()) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Corrupted line - log but continue
          console.error(`Corrupted tx log entry: ${line.slice(0, 100)}`);
        }
      }
    }
  }
  return entries.sort((a, b) => a.seq - b.seq);
}

// Initialize database with WAL mode for crash safety
const db: DatabaseType = new Database(DB_PATH);

// CRITICAL: These pragmas make saves survive power loss
db.pragma("journal_mode = WAL"); // Write-ahead logging
db.pragma("synchronous = FULL"); // fsync on every commit - ironclad
db.pragma("foreign_keys = ON"); // Referential integrity

// Create tables
db.exec(`
  -- Projects table
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    story_bible TEXT,  -- JSON blob
    word_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Chapters table
  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    word_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- Chapter versions - NEVER DELETE, this is the ironclad history
  CREATE TABLE IF NOT EXISTS chapter_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    trigger TEXT,  -- 'sentence_end', 'paragraph', 'idle', 'manual', 'generation'
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  -- Autonomous session snapshots - save state for recovery
  CREATE TABLE IF NOT EXISTS session_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    session_data TEXT NOT NULL,  -- JSON blob of full session state
    chapter_id TEXT NOT NULL,
    words_generated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Generated drafts - durable recovery for editor generations before chapter save
  CREATE TABLE IF NOT EXISTS generated_drafts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    source TEXT NOT NULL,
    draft_text TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    prompt TEXT,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Index for fast lookups
  CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
  CREATE INDEX IF NOT EXISTS idx_versions_chapter ON chapter_versions(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_versions_created ON chapter_versions(created_at);
  CREATE INDEX IF NOT EXISTS idx_snapshots_session ON session_snapshots(session_id);
  CREATE INDEX IF NOT EXISTS idx_generated_drafts_chapter_status
    ON generated_drafts(chapter_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_generated_drafts_project_status
    ON generated_drafts(project_id, status, created_at);
`);

// Prepared statements for performance
const statements = {
  // Projects
  insertProject: db.prepare(`
    INSERT INTO projects (id, title, content, story_bible, word_count)
    VALUES (@id, @title, @content, @storyBible, @wordCount)
  `),
  updateProject: db.prepare(`
    UPDATE projects SET title = @title, content = @content, story_bible = @storyBible,
    word_count = @wordCount, updated_at = datetime('now') WHERE id = @id
  `),
  getProject: db.prepare("SELECT * FROM projects WHERE id = ?"),
  getAllProjects: db.prepare("SELECT * FROM projects ORDER BY updated_at DESC"),
  deleteProject: db.prepare("DELETE FROM projects WHERE id = ?"),

  // Chapters
  insertChapter: db.prepare(`
    INSERT INTO chapters (id, project_id, title, content, word_count, sort_order)
    VALUES (@id, @projectId, @title, @content, @wordCount, @sortOrder)
  `),
  updateChapter: db.prepare(`
    UPDATE chapters SET title = @title, content = @content, word_count = @wordCount,
    sort_order = @sortOrder, updated_at = datetime('now') WHERE id = @id
  `),
  updateChapterContent: db.prepare(`
    UPDATE chapters SET content = @content, word_count = @wordCount,
    updated_at = datetime('now') WHERE id = @id
  `),
  getChapter: db.prepare("SELECT * FROM chapters WHERE id = ?"),
  getChaptersByProject: db.prepare(
    "SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order",
  ),
  deleteChapter: db.prepare("DELETE FROM chapters WHERE id = ?"),

  // Chapter versions - the ironclad history
  insertVersion: db.prepare(`
    INSERT INTO chapter_versions (chapter_id, content, word_count, trigger)
    VALUES (@chapterId, @content, @wordCount, @trigger)
  `),
  getVersions: db.prepare(`
    SELECT * FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT ?
  `),
  getLatestVersion: db.prepare(`
    SELECT * FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 1
  `),

  // Session snapshots
  insertSnapshot: db.prepare(`
    INSERT INTO session_snapshots (session_id, session_data, chapter_id, words_generated)
    VALUES (@sessionId, @sessionData, @chapterId, @wordsGenerated)
  `),
  getLatestSnapshot: db.prepare(`
    SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
  `),
  insertGeneratedDraft: db.prepare(`
    INSERT INTO generated_drafts (
      id, project_id, chapter_id, source, draft_text, word_count, prompt, metadata, status
    ) VALUES (
      @id, @projectId, @chapterId, @source, @draftText, @wordCount, @prompt, @metadata, @status
    )
  `),
  getGeneratedDraft: db.prepare(`
    SELECT * FROM generated_drafts WHERE id = ?
  `),
  getLatestPendingGeneratedDraft: db.prepare(`
    SELECT * FROM generated_drafts
    WHERE project_id = ? AND chapter_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `),
  updateGeneratedDraftStatus: db.prepare(`
    UPDATE generated_drafts
    SET status = @status, updated_at = datetime('now')
    WHERE id = @id
  `),
};

export interface ChapterSave {
  chapterId: string;
  content: string;
  wordCount: number;
  trigger:
    | "sentence_end"
    | "paragraph"
    | "word_boundary"
    | "idle"
    | "manual"
    | "generation"
    | "accepted_generation"
    | "auto_accepted_generation"
    | "auto_accepted_generation_retry"
    | "paste"
    | "autonomous";
}

// Save chapter with version history - this is the core ironclad save
// Triple redundancy: 1) Transaction log 2) SQLite WAL 3) Version history
export function saveChapterWithHistory(save: ChapterSave): void {
  // LAYER 1: Write to transaction log FIRST (survives anything)
  writeTxLog({
    op: "save",
    chapterId: save.chapterId,
    content: save.content,
    wordCount: save.wordCount,
    trigger: save.trigger,
  });

  // LAYER 2 & 3: SQLite with WAL + version history
  const txn = db.transaction(() => {
    // Update current chapter
    statements.updateChapterContent.run({
      id: save.chapterId,
      content: save.content,
      wordCount: save.wordCount,
    });

    // Insert version record - NEVER loses data
    statements.insertVersion.run({
      chapterId: save.chapterId,
      content: save.content,
      wordCount: save.wordCount,
      trigger: save.trigger,
    });
  });

  txn(); // Execute transaction - commits to WAL immediately
}

// Get chapter version history
export function getChapterHistory(
  chapterId: string,
  limit: number = 100,
): ChapterVersionRow[] {
  return statements.getVersions.all(chapterId, limit) as ChapterVersionRow[];
}

// Restore chapter from version
export function restoreChapterVersion(
  chapterId: string,
  versionId: number,
): void {
  const version = db
    .prepare("SELECT * FROM chapter_versions WHERE id = ?")
    .get(versionId) as ChapterVersionRow | undefined;
  if (!version) throw new Error(`Version ${versionId} not found`);

  saveChapterWithHistory({
    chapterId,
    content: version.content,
    wordCount: version.word_count,
    trigger: "manual",
  });
}

// Session snapshot for autonomous writer recovery
export function saveSessionSnapshot(
  sessionId: string,
  sessionData: unknown,
  chapterId: string,
  wordsGenerated: number,
): void {
  statements.insertSnapshot.run({
    sessionId,
    sessionData: JSON.stringify(sessionData),
    chapterId,
    wordsGenerated,
  });
}

export function getLatestSessionSnapshot(
  sessionId: string,
): SessionSnapshotRecord | undefined {
  const row = statements.getLatestSnapshot.get(sessionId) as
    | SessionSnapshotRow
    | undefined;
  if (!row) return undefined;
  return {
    ...row,
    sessionData: JSON.parse(row.session_data),
  };
}

function mapGeneratedDraftRow(
  row: GeneratedDraftRow | undefined,
): GeneratedDraftRecord | undefined {
  if (!row) return undefined;

  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    source: row.source,
    text: row.draft_text,
    wordCount: row.word_count,
    prompt: row.prompt || undefined,
    metadata: row.metadata
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : undefined,
    status:
      row.status === "persisted" || row.status === "dismissed"
        ? row.status
        : "pending",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveGeneratedDraft(input: {
  projectId: string;
  chapterId: string;
  text: string;
  wordCount: number;
  source: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}): string {
  const id = crypto.randomUUID();

  writeTxLog({
    op: "generated_draft",
    chapterId: input.chapterId,
    content: input.text,
    wordCount: input.wordCount,
    trigger: input.source,
  });

  statements.insertGeneratedDraft.run({
    id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    source: input.source,
    draftText: input.text,
    wordCount: input.wordCount,
    prompt: input.prompt || null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    status: "pending",
  });

  return id;
}

export function getGeneratedDraft(
  id: string,
): GeneratedDraftRecord | undefined {
  return mapGeneratedDraftRow(
    statements.getGeneratedDraft.get(id) as GeneratedDraftRow | undefined,
  );
}

export function getLatestPendingGeneratedDraft(
  projectId: string,
  chapterId: string,
): GeneratedDraftRecord | undefined {
  return mapGeneratedDraftRow(
    statements.getLatestPendingGeneratedDraft.get(projectId, chapterId) as
      | GeneratedDraftRow
      | undefined,
  );
}

export function resolveGeneratedDraft(
  id: string,
  status: "persisted" | "dismissed",
): void {
  const existing = getGeneratedDraft(id);
  if (!existing || existing.status === status) {
    return;
  }

  writeTxLog({
    op: "resolve_draft",
    chapterId: existing.chapterId,
    content: existing.text,
    wordCount: existing.wordCount,
    trigger: status,
  });

  statements.updateGeneratedDraftStatus.run({ id, status });
}

// Project operations
export function saveProject(project: {
  id: string;
  title: string;
  content?: string;
  storyBible?: unknown;
  wordCount?: number;
}): void {
  const existing = statements.getProject.get(project.id);
  const data = {
    id: project.id,
    title: project.title,
    content: project.content || "",
    storyBible: project.storyBible ? JSON.stringify(project.storyBible) : null,
    wordCount: project.wordCount || 0,
  };

  if (existing) {
    statements.updateProject.run(data);
  } else {
    statements.insertProject.run(data);
  }
}

export function getProject(id: string): DatabaseProjectRow | undefined {
  const row = statements.getProject.get(id) as ProjectRow | undefined;
  if (!row) return undefined;
  return {
    ...row,
    wordCount: row.word_count,
    storyBible: row.story_bible ? JSON.parse(row.story_bible) : null,
  };
}

export function getAllProjects(): DatabaseProjectRow[] {
  return (statements.getAllProjects.all() as ProjectRow[]).map((row) => ({
    ...row,
    wordCount: row.word_count,
    storyBible: row.story_bible ? JSON.parse(row.story_bible) : null,
  }));
}

export function deleteProject(id: string): void {
  statements.deleteProject.run(id);
}

// Chapter operations
export function saveChapter(chapter: {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  wordCount?: number;
  sortOrder?: number;
}): void {
  const existing = statements.getChapter.get(chapter.id);
  const data = {
    id: chapter.id,
    projectId: chapter.projectId,
    title: chapter.title,
    content: chapter.content || "",
    wordCount: chapter.wordCount || 0,
    sortOrder: chapter.sortOrder || 0,
  };

  if (existing) {
    statements.updateChapter.run(data);
  } else {
    statements.insertChapter.run(data);
  }
}

export function getChapter(id: string): ChapterRow | undefined {
  return statements.getChapter.get(id) as ChapterRow | undefined;
}

export function getChaptersByProject(projectId: string): ChapterRow[] {
  return statements.getChaptersByProject.all(projectId) as ChapterRow[];
}

export function deleteChapter(id: string): void {
  statements.deleteChapter.run(id);
}

// Cleanup old versions (optional - keep last N versions per chapter)
export function pruneOldVersions(keepCount: number = 1000): number {
  const result = db
    .prepare(
      `
    DELETE FROM chapter_versions WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY chapter_id ORDER BY created_at DESC) as rn
        FROM chapter_versions
      ) WHERE rn <= ?
    )
  `,
    )
    .run(keepCount);
  return result.changes;
}

// Database health check
export function checkDatabaseHealth(): {
  ok: boolean;
  walMode: boolean;
  syncMode: string;
} {
  const walMode = db.pragma("journal_mode", { simple: true }) === "wal";
  const syncModeNum = db.pragma("synchronous", { simple: true }) as number;
  return {
    ok: walMode && syncModeNum === 2, // 2 = FULL
    walMode,
    syncMode: syncModeNum === 2 ? "FULL" : syncModeNum === 1 ? "NORMAL" : "OFF",
  };
}

// Close database connection (for graceful shutdown)
export function closeDb(): void {
  db.close();
}

export default db;
