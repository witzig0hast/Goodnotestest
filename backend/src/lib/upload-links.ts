import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { generateUploadLinkId } from "./ids.js";

/**
 * Upload links are the reverse of share links: whoever has one can drop
 * files into one folder of the owner's account (e.g. a lecture's slides
 * from a classmate) — without seeing anything that's already there.
 */

export interface UploadLinkRecord {
  id: string;
  repositoryId: string;
  relativePath: string;
  label: string | null;
  passwordHash: string | null;
  expiresAt: string | null;
  maxFiles: number | null;
  uploadCount: number;
  notifyOwner: boolean;
  createdAt: string;
}

interface UploadLinkRow {
  id: string;
  repository_id: string;
  relative_path: string;
  label: string | null;
  password_hash: string | null;
  expires_at: string | null;
  max_files: number | null;
  upload_count: number;
  notify_owner: number;
  created_at: string;
}

function toRecord(row: UploadLinkRow): UploadLinkRecord {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    relativePath: row.relative_path,
    label: row.label,
    passwordHash: row.password_hash,
    expiresAt: row.expires_at,
    maxFiles: row.max_files,
    uploadCount: row.upload_count,
    notifyOwner: row.notify_owner === 1,
    createdAt: row.created_at,
  };
}

export function createUploadLink(input: {
  repositoryId: string;
  relativePath: string;
  label: string | null;
  password: string | null;
  expiresInDays: number | null;
  maxFiles: number | null;
  notifyOwner: boolean;
}): UploadLinkRecord {
  const id = generateUploadLinkId();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  db.prepare(
    `INSERT INTO upload_links (id, repository_id, relative_path, label, password_hash, expires_at, max_files, notify_owner)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.repositoryId,
    input.relativePath,
    input.label,
    input.password ? bcrypt.hashSync(input.password, 10) : null,
    expiresAt,
    input.maxFiles,
    input.notifyOwner ? 1 : 0
  );
  return findUploadLinkById(id)!;
}

export function findUploadLinkById(id: string): UploadLinkRecord | undefined {
  const row = db.prepare("SELECT * FROM upload_links WHERE id = ?").get(id) as UploadLinkRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function listUploadLinksForRepository(repositoryId: string): UploadLinkRecord[] {
  return (
    db
      .prepare("SELECT * FROM upload_links WHERE repository_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(repositoryId) as UploadLinkRow[]
  ).map(toRecord);
}

export function deleteUploadLink(repositoryId: string, id: string): boolean {
  return (
    db.prepare("DELETE FROM upload_links WHERE id = ? AND repository_id = ?").run(id, repositoryId)
      .changes > 0
  );
}

export function recordUploadLinkUse(id: string): void {
  db.prepare("UPDATE upload_links SET upload_count = upload_count + 1 WHERE id = ?").run(id);
}

export function isUploadLinkExpired(link: UploadLinkRecord): boolean {
  return Boolean(link.expiresAt && new Date(link.expiresAt).getTime() < Date.now());
}

export function isUploadLinkFull(link: UploadLinkRecord): boolean {
  return link.maxFiles !== null && link.uploadCount >= link.maxFiles;
}

export function verifyUploadLinkPassword(link: UploadLinkRecord, password: string): boolean {
  return !link.passwordHash || bcrypt.compareSync(password, link.passwordHash);
}
