import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { generateShareLinkId } from "./ids.js";

export interface ShareLinkItem {
  relativePath: string;
  isDirectory: boolean;
}

export interface ShareLinkRecord {
  id: string;
  repositoryId: string;
  items: ShareLinkItem[];
  passwordHash: string | null;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

interface ShareLinkRow {
  id: string;
  repository_id: string;
  password_hash: string | null;
  expires_at: string | null;
  view_count: number;
  created_at: string;
}

interface ShareLinkItemRow {
  relative_path: string;
  is_directory: number;
}

function loadItems(shareId: string): ShareLinkItem[] {
  const rows = db
    .prepare("SELECT relative_path, is_directory FROM share_link_items WHERE share_id = ?")
    .all(shareId) as ShareLinkItemRow[];
  return rows.map((row) => ({
    relativePath: row.relative_path,
    isDirectory: row.is_directory === 1,
  }));
}

function toRecord(row: ShareLinkRow): ShareLinkRecord {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    items: loadItems(row.id),
    passwordHash: row.password_hash,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    createdAt: row.created_at,
  };
}

export function createShareLink(input: {
  repositoryId: string;
  items: ShareLinkItem[];
  password: string | null;
  expiresInDays: number | null;
}): ShareLinkRecord {
  if (input.items.length === 0) {
    throw new Error("Ein Share-Link braucht mindestens eine Datei oder einen Ordner.");
  }

  const id = generateShareLinkId();
  const passwordHash = input.password ? bcrypt.hashSync(input.password, 10) : null;
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const first = input.items[0];

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO share_links (id, repository_id, relative_path, is_directory, password_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.repositoryId, first.relativePath, first.isDirectory ? 1 : 0, passwordHash, expiresAt);

    const insertItem = db.prepare(
      "INSERT INTO share_link_items (share_id, relative_path, is_directory) VALUES (?, ?, ?)"
    );
    for (const item of input.items) {
      insertItem.run(id, item.relativePath, item.isDirectory ? 1 : 0);
    }
  });
  insert();

  return {
    id,
    repositoryId: input.repositoryId,
    items: input.items,
    passwordHash,
    expiresAt,
    viewCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export function findShareLinkById(id: string): ShareLinkRecord | undefined {
  const row = db.prepare("SELECT * FROM share_links WHERE id = ?").get(id) as
    | ShareLinkRow
    | undefined;
  return row ? toRecord(row) : undefined;
}

export function listShareLinksForRepository(repositoryId: string): ShareLinkRecord[] {
  const rows = db
    .prepare("SELECT * FROM share_links WHERE repository_id = ? ORDER BY created_at DESC")
    .all(repositoryId) as ShareLinkRow[];
  return rows.map(toRecord);
}

export function deleteShareLink(repositoryId: string, id: string): boolean {
  const result = db
    .prepare("DELETE FROM share_links WHERE id = ? AND repository_id = ?")
    .run(id, repositoryId);
  return result.changes > 0;
}

export function recordShareLinkView(id: string): void {
  db.prepare("UPDATE share_links SET view_count = view_count + 1 WHERE id = ?").run(id);
}

export function isShareLinkExpired(link: ShareLinkRecord): boolean {
  return Boolean(link.expiresAt && new Date(link.expiresAt).getTime() < Date.now());
}

export function verifyShareLinkPassword(link: ShareLinkRecord, password: string): boolean {
  if (!link.passwordHash) return true;
  return bcrypt.compareSync(password, link.passwordHash);
}
