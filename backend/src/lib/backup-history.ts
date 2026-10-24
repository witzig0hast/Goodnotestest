import { db } from "./db.js";

/**
 * Counts uploads per calendar day (server time), which is all the backup
 * calendar needs — when did backups arrive, and where are the gaps.
 */
export function recordUpload(repositoryId: string, at = new Date()): void {
  const day = at.toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO backup_days (repository_id, day, uploads, last_upload_at) VALUES (?, ?, 1, ?)
     ON CONFLICT (repository_id, day) DO UPDATE SET uploads = uploads + 1, last_upload_at = excluded.last_upload_at`
  ).run(repositoryId, day, at.toISOString());
}

export interface BackupDay {
  day: string;
  uploads: number;
  lastUploadAt: string;
}

export function listBackupDays(repositoryId: string, days: number): BackupDay[] {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT day, uploads, last_upload_at FROM backup_days
       WHERE repository_id = ? AND day >= ? ORDER BY day ASC`
    )
    .all(repositoryId, since) as { day: string; uploads: number; last_upload_at: string }[];
  return rows.map((r) => ({ day: r.day, uploads: r.uploads, lastUploadAt: r.last_upload_at }));
}
