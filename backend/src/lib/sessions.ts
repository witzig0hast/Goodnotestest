import type { Request } from "express";
import { db } from "./db.js";
import { generateId } from "./ids.js";

/**
 * Server-side record of every sign-in, so the account owner can see where
 * they're signed in and sign individual devices out. The session cookie
 * (a JWT) carries the session id; requireSession rejects tokens whose
 * session row is gone.
 */

export type SessionMethod = "password" | "password+2fa" | "passkey" | "code" | "sso" | "signup";

export function createSession(repositoryId: string, req: Request | undefined, method: SessionMethod): string {
  const id = generateId();
  db.prepare(
    "INSERT INTO sessions (id, repository_id, user_agent, ip, method) VALUES (?, ?, ?, ?, ?)"
  ).run(id, repositoryId, req?.headers["user-agent"]?.slice(0, 300) ?? null, req?.ip ?? null, method);
  return id;
}

export function sessionExists(id: string, repositoryId: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sessions WHERE id = ? AND repository_id = ?").get(id, repositoryId)
  );
}

// last_seen is informational; once every few minutes per session is plenty.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const lastTouch = new Map<string, number>();

export function touchSession(id: string, ip: string | undefined): void {
  const now = Date.now();
  if (now - (lastTouch.get(id) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouch.set(id, now);
  db.prepare("UPDATE sessions SET last_seen_at = datetime('now'), ip = COALESCE(?, ip) WHERE id = ?").run(
    ip ?? null,
    id
  );
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  method: SessionMethod | null;
  createdAt: string;
  lastSeenAt: string;
}

const iso = (sqlite: string) => new Date(sqlite.replace(" ", "T") + "Z").toISOString();

export function listSessions(repositoryId: string): SessionInfo[] {
  const rows = db
    .prepare("SELECT * FROM sessions WHERE repository_id = ? ORDER BY last_seen_at DESC")
    .all(repositoryId) as {
    id: string;
    user_agent: string | null;
    ip: string | null;
    method: SessionMethod | null;
    created_at: string;
    last_seen_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    ip: r.ip,
    method: r.method,
    createdAt: iso(r.created_at),
    lastSeenAt: iso(r.last_seen_at),
  }));
}

export function deleteSession(repositoryId: string, id: string): boolean {
  return db.prepare("DELETE FROM sessions WHERE id = ? AND repository_id = ?").run(id, repositoryId).changes > 0;
}

export function deleteOtherSessions(repositoryId: string, keepId: string | undefined): number {
  return db
    .prepare("DELETE FROM sessions WHERE repository_id = ? AND id != ?")
    .run(repositoryId, keepId ?? "").changes;
}

/** Sessions expire with their cookie after 30 days; drop the rows too. */
export function pruneSessions(): void {
  db.prepare("DELETE FROM sessions WHERE last_seen_at < datetime('now', '-31 days')").run();
}
