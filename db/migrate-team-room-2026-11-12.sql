-- Phong chung cua doi (team.hora.works) — bang rieng team_* trong D1 hora-website.
-- Functions /api/team/* tu chay CREATE TABLE IF NOT EXISTS khi chay lan dau,
-- file nay chi de tham chieu / chay tay khi can.
CREATE TABLE IF NOT EXISTS team_members (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member',
  code_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS team_sessions (
  token_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS team_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  ok INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
