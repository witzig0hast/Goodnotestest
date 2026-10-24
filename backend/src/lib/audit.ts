import type { Request } from "express";
import { db } from "./db.js";

/**
 * A simple per-account activity log: sign-ins (and failed attempts),
 * shares, deletions, restores, uploads via upload links, credential
 * changes. Account owners see their own entries, the admin sees all.
 * Entries are kept for AUDIT_RETENTION_DAYS and then pruned.
 */

const AUDIT_RETENTION_DAYS = 180;

export type AuditAction =
  | "login.password"
  | "login.passkey"
  | "login.code"
  | "login.sso"
  | "login.failed"
  | "logout"
  | "file.delete"
  | "file.rename"
  | "version.restore"
  | "trash.restore"
  | "trash.purge"
  | "trash.empty"
  | "share.create"
  | "share.revoke"
  | "share.limit_reached"
  | "upload_link.create"
  | "upload_link.revoke"
  | "upload_link.upload"
  | "webdav.password_regenerated"
  | "pin.regenerated"
  | "passkey.added"
  | "admin.approve"
  | "admin.reject"
  | "admin.quota";

export function logAuditFor(
  repositoryId: string | null,
  action: AuditAction,
  detail?: string | null,
  ip?: string | null
): void {
  try {
    db.prepare(
      "INSERT INTO audit_log (repository_id, action, detail, ip) VALUES (?, ?, ?, ?)"
    ).run(repositoryId, action, detail ?? null, ip ?? null);
  } catch {
    // Logging must never break the action being logged.
  }
}

/** Logs for the signed-in account of `req` (or `repositoryId`, when given explicitly). */
export function logAudit(
  req: Request,
  action: AuditAction,
  detail?: string | null,
  repositoryId?: string
): void {
  logAuditFor(repositoryId ?? req.repositoryId ?? null, action, detail, req.ip ?? null);
}

export interface AuditEntry {
  id: number;
  repositoryId: string | null;
  repositoryName?: string | null;
  action: AuditAction;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

interface AuditRow {
  id: number;
  repository_id: string | null;
  repository_name?: string | null;
  action: AuditAction;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    repositoryName: row.repository_name,
    action: row.action,
    detail: row.detail,
    ip: row.ip,
    createdAt: new Date(row.created_at.replace(" ", "T") + "Z").toISOString(),
  };
}

export function listAuditForRepository(repositoryId: string, limit = 200): AuditEntry[] {
  return (
    db
      .prepare(
        "SELECT * FROM audit_log WHERE repository_id = ? ORDER BY id DESC LIMIT ?"
      )
      .all(repositoryId, limit) as AuditRow[]
  ).map(toEntry);
}

export function listAuditAll(limit = 300): AuditEntry[] {
  return (
    db
      .prepare(
        `SELECT a.*, r.name AS repository_name FROM audit_log a
         LEFT JOIN repositories r ON r.id = a.repository_id
         ORDER BY a.id DESC LIMIT ?`
      )
      .all(limit) as AuditRow[]
  ).map(toEntry);
}

export function pruneAuditLog(): void {
  db.prepare(
    `DELETE FROM audit_log WHERE created_at < datetime('now', ?)`
  ).run(`-${AUDIT_RETENTION_DAYS} days`);
}
