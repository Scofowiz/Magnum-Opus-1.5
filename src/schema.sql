-- Magnum Opus Database Schema for Cloudflare D1
-- Migration from Express.js to Cloudflare Workers

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  genre TEXT DEFAULT '',
  word_count INTEGER DEFAULT 0,
  chapter_count INTEGER DEFAULT 0,
  has_story_bible BOOLEAN DEFAULT FALSE,
  story_bible TEXT DEFAULT NULL, -- JSON content
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

-- Project history/chapter versions table
CREATE TABLE IF NOT EXISTS chapter_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

-- User preferences table
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id TEXT DEFAULT 'default',
  provider_type TEXT DEFAULT 'groq',
  model TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  base_url TEXT DEFAULT NULL,
  style_fingerprint TEXT DEFAULT NULL,
  craft_patterns TEXT DEFAULT NULL, -- JSON array
  export_configs TEXT DEFAULT NULL, -- JSON object
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Autonomous sessions table
CREATE TABLE IF NOT EXISTS autonomous_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  settings TEXT NOT NULL, -- JSON object
  book_progress TEXT DEFAULT NULL, -- JSON object
  feedback_history TEXT DEFAULT '[]', -- JSON array
  version_history TEXT DEFAULT '[]', -- JSON array
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Generated drafts table
CREATE TABLE IF NOT EXISTS generated_drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  prompt TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}', -- JSON object
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'persisted', 'dismissed')),
  source TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

-- Metrics table for observability
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL, -- 'token_usage', 'quality_score', 'latency', etc.
  project_id TEXT,
  chapter_id TEXT,
  endpoint TEXT,
  value REAL NOT NULL,
  metadata TEXT DEFAULT '{}', -- JSON object
  created_at TEXT DEFAULT (datetime('now'))
);

-- Author profile table
CREATE TABLE IF NOT EXISTS author_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT DEFAULT 'Anonymous',
  bio TEXT DEFAULT '',
  genres TEXT DEFAULT '[]', -- JSON array
  style_notes TEXT DEFAULT '',
  achievements TEXT DEFAULT '[]', -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Export configurations table
CREATE TABLE IF NOT EXISTS export_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'docx', 'markdown', 'scrivener', 'final-draft')),
  settings TEXT DEFAULT '{}', -- JSON object with format-specific settings
  is_default BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_sort_order ON chapters(sort_order);
CREATE INDEX IF NOT EXISTS idx_chapter_history_chapter ON chapter_history(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_history_created ON chapter_history(created_at);
CREATE INDEX IF NOT EXISTS idx_generated_drafts_project ON generated_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_drafts_chapter ON generated_drafts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_generated_drafts_status ON generated_drafts(status);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_autonomous_sessions_project ON autonomous_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_sessions_status ON autonomous_sessions(status);
CREATE INDEX IF NOT EXISTS idx_preferences_user ON preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_export_configs_user ON export_configs(user_id);

-- Insert default preferences if not exists
INSERT OR IGNORE INTO preferences (id, provider_type) VALUES ('default', 'groq');

-- Insert default author profile if not exists
INSERT OR IGNORE INTO author_profiles (id, name) VALUES ('default', 'Anonymous');

-- Insert default export config if not exists
INSERT OR IGNORE INTO export_configs (id, name, format, is_default) 
VALUES ('default', 'Standard PDF', 'pdf', true);

-- Seed data for testing (optional - remove in production)
-- INSERT INTO projects (id, title, description, genre) VALUES 
-- ('test-project-1', 'Test Project', 'A test project for development', 'Fiction'),
-- ('test-project-2', 'My Novel', 'My first novel project', 'Fantasy');