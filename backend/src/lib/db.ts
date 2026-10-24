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
    is_admin INTEGER NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'approved',
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

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS oidc_identities (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS oidc_identities_provider_subject_idx
    ON oidc_identities (provider, subject);

  CREATE INDEX IF NOT EXISTS oidc_identities_repository_id_idx
    ON oidc_identities (repository_id);
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
  ["is_admin", "INTEGER NOT NULL DEFAULT 0"],
  ["approval_status", "TEXT NOT NULL DEFAULT 'approved'"],
] as const) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE repositories ADD COLUMN ${column} ${definition}`);
  }
}

// Every existing installation needs exactly one admin to approve new
// sign-ups — the account that registered first (by creation time) is
// promoted automatically the first time this runs, so upgrading never
// locks an existing single-user setup out of its own admin page.
const hasAdmin = db.prepare("SELECT 1 FROM repositories WHERE is_admin = 1 LIMIT 1").get();
if (!hasAdmin) {
  db.exec(`
    UPDATE repositories SET is_admin = 1, approval_status = 'approved'
    WHERE id = (SELECT id FROM repositories ORDER BY created_at ASC, rowid ASC LIMIT 1)
  `);
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

// --- Tables for setup status, backup history, trash, OCR, upload links,
// tags and the audit log. All additive: CREATE TABLE IF NOT EXISTS for new
// tables, guarded ALTER TABLE for new columns on existing ones.
db.exec(`
  CREATE TABLE IF NOT EXISTS webdav_status (
    repository_id TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
    last_success_at TEXT,
    last_error TEXT,
    last_error_at TEXT
  );

  CREATE TABLE IF NOT EXISTS backup_days (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    uploads INTEGER NOT NULL DEFAULT 0,
    last_upload_at TEXT NOT NULL,
    PRIMARY KEY (repository_id, day)
  );

  CREATE TABLE IF NOT EXISTS trash_items (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    original_path TEXT NOT NULL,
    is_directory INTEGER NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    deleted_by TEXT NOT NULL DEFAULT 'web',
    deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS trash_items_repository_id_idx ON trash_items (repository_id);

  CREATE TABLE IF NOT EXISTS file_page_text (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    mtime TEXT NOT NULL,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (repository_id, relative_path, page)
  );

  CREATE TABLE IF NOT EXISTS upload_links (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    label TEXT,
    password_hash TEXT,
    expires_at TEXT,
    max_files INTEGER,
    upload_count INTEGER NOT NULL DEFAULT 0,
    notify_owner INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS upload_links_repository_id_idx ON upload_links (repository_id);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS tags_repository_name_idx ON tags (repository_id, name);

  CREATE TABLE IF NOT EXISTS file_tags (
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (repository_id, relative_path, tag_id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id TEXT REFERENCES repositories(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS audit_log_repository_id_idx ON audit_log (repository_id, created_at);
`);

function addColumnsIfMissing(table: string, columns: [string, string][]) {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  );
  for (const [column, definition] of columns) {
    if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnsIfMissing("repositories", [["storage_quota_bytes", "INTEGER"]]);
addColumnsIfMissing("share_links", [
  ["notify_on_open", "INTEGER NOT NULL DEFAULT 0"],
  ["max_downloads", "INTEGER"],
  ["download_count", "INTEGER NOT NULL DEFAULT 0"],
  ["last_notified_at", "TEXT"],
]);
