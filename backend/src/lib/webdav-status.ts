import { db } from "./db.js";

/**
 * Remembers the last successful and failed WebDAV sign-in per account, so
 * the setup page can tell someone "GoodNotes has connected" or "GoodNotes
 * tried, but the password was wrong" instead of leaving them guessing why
 * nothing shows up.
 */

// GoodNotes authenticates on every single request of a backup run; one
// write per account every half minute is plenty for a status display.
const SUCCESS_WRITE_INTERVAL_MS = 30 * 1000;
const lastSuccessWrite = new Map<string, number>();

export type WebdavFailureReason =
  | "wrong_password"
  | "unknown_user"
  | "pending_approval"
  | "quota_exceeded";

export function recordWebdavSuccess(repositoryId: string): void {
  const now = Date.now();
  if (now - (lastSuccessWrite.get(repositoryId) ?? 0) < SUCCESS_WRITE_INTERVAL_MS) return;
  lastSuccessWrite.set(repositoryId, now);
  db.prepare(
    `INSERT INTO webdav_status (repository_id, last_success_at) VALUES (?, ?)
     ON CONFLICT (repository_id) DO UPDATE SET last_success_at = excluded.last_success_at`
  ).run(repositoryId, new Date(now).toISOString());
}

export function recordWebdavFailure(repositoryId: string, reason: WebdavFailureReason): void {
  db.prepare(
    `INSERT INTO webdav_status (repository_id, last_error, last_error_at) VALUES (?, ?, ?)
     ON CONFLICT (repository_id) DO UPDATE SET last_error = excluded.last_error, last_error_at = excluded.last_error_at`
  ).run(repositoryId, reason, new Date().toISOString());
}

export interface WebdavStatus {
  lastSuccessAt: string | null;
  lastError: WebdavFailureReason | null;
  lastErrorAt: string | null;
}

export function getWebdavStatus(repositoryId: string): WebdavStatus {
  const row = db
    .prepare("SELECT last_success_at, last_error, last_error_at FROM webdav_status WHERE repository_id = ?")
    .get(repositoryId) as
    | { last_success_at: string | null; last_error: WebdavFailureReason | null; last_error_at: string | null }
    | undefined;
  return {
    lastSuccessAt: row?.last_success_at ?? null,
    lastError: row?.last_error ?? null,
    lastErrorAt: row?.last_error_at ?? null,
  };
}
