import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    webdav_username TEXT NOT NULL UNIQUE,
    webdav_password_hash TEXT NOT NULL,
    nextcloud_url TEXT,
    nextcloud_username TEXT,
    nextcloud_password_enc TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    webauthn_user_handle TEXT,
    notifications_enabled INTEGER NOT NULL DEFAULT 0,
    notify_after_days INTEGER,
    last_notified_at TEXT,
    weekly_digest_enabled INTEGER NOT NULL DEFAULT 0,
    last_digest_sent_at TEXT,
    nextcloud_sync_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS thumbnails_meta (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    mtime TEXT NOT NULL,
    PRIMARY KEY (repository_id, relative_path)
  );

  CREATE TABLE IF NOT EXISTS file_text_index (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    mtime TEXT NOT NULL,
    text TEXT NOT NULL,
    indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repository_id, relative_path)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repository_id, relative_path)
  );

  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS webauthn_credentials_repository_id_idx
    ON webauthn_credentials (repository_id);

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    is_directory INTEGER NOT NULL,
    password_hash TEXT,
    expires_at TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS share_links_repository_id_idx
    ON share_links (repository_id);

  CREATE TABLE IF NOT EXISTS share_link_items (
    share_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    is_directory INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS share_link_items_share_id_idx
    ON share_link_items (share_id);
`);

// Every share link used to carry exactly one path directly on the
// share_links row. Links can now bundle several paths, stored in
// share_link_items instead — existing rows get backfilled into that table
// once, the legacy columns stay untouched (and unused) for them.
db.exec(`
  INSERT INTO share_link_items (share_id, relative_path, is_directory)
  SELECT id, relative_path, is_directory FROM share_links
  WHERE id NOT IN (SELECT share_id FROM share_link_items)
`);

// Additive migration for databases created before accounts (email/password/
// passkeys) existed — CREATE TABLE IF NOT EXISTS above doesn't add columns
// to an already-existing table, so any new nullable columns go here.
const existingColumns = new Set(
  (db.prepare("PRAGMA table_info(repositories)").all() as { name: string }[]).map(
    (col) => col.name
  )
);

for (const [column, definition] of [
  ["email", "TEXT"],
  ["password_hash", "TEXT"],
  ["webauthn_user_handle", "TEXT"],
  ["notifications_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["notify_after_days", "INTEGER"],
  ["last_notified_at", "TEXT"],
  ["weekly_digest_enabled", "INTEGER NOT NULL DEFAULT 0"],
  ["last_digest_sent_at", "TEXT"],
  ["nextcloud_sync_path", "TEXT"],
] as const) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE repositories ADD COLUMN ${column} ${definition}`);
  }
}

const existingShareLinkColumns = new Set(
  (db.prepare("PRAGMA table_info(share_links)").all() as { name: string }[]).map(
    (col) => col.name
  )
);
if (!existingShareLinkColumns.has("view_count")) {
  db.exec("ALTER TABLE share_links ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0");
}

// SQLite can't add a UNIQUE column after the fact, so the constraint is
// enforced with a separate unique index instead (email may be NULL for
// repositories created before accounts existed — SQLite allows any number
// of NULLs in a unique index).
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS repositories_email_idx ON repositories (email)`
);
