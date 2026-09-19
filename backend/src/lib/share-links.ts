import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { generateShareLinkId } from "./ids.js";

export interface ShareLinkRecord {
  id: string;
  repositoryId: string;
  relativePath: string;
  isDirectory: boolean;
  passwordHash: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ShareLinkRow {
  id: string;
  repository_id: string;
  relative_path: string;
  is_directory: number;
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
}

function toRecord(row: ShareLinkRow): ShareLinkRecord {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    relativePath: row.relative_path,
    isDirectory: row.is_directory === 1,
    passwordHash: row.password_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function createShareLink(input: {
  repositoryId: string;
  relativePath: string;
  isDirectory: boolean;
  password: string | null;
  expiresInDays: number | null;
}): ShareLinkRecord {
  const id = generateShareLinkId();
  const passwordHash = input.password ? bcrypt.hashSync(input.password, 10) : null;
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  db.prepare(
    `INSERT INTO share_links (id, repository_id, relative_path, is_directory, password_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.repositoryId, input.relativePath, input.isDirectory ? 1 : 0, passwordHash, expiresAt);

  return {
    id,
    repositoryId: input.repositoryId,
    relativePath: input.relativePath,
    isDirectory: input.isDirectory,
    passwordHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
}

export function findShareLinkById(id: string): ShareLinkRecord | undefined {
  const row = db.prepare("SELECT * FROM share_links WHERE id = ?").get(id) as
    | ShareLinkRow
    | undefined;
  return row ? toRecord(row) : undefined;
}

export function isShareLinkExpired(link: ShareLinkRecord): boolean {
  return Boolean(link.expiresAt && new Date(link.expiresAt).getTime() < Date.now());
}

export function verifyShareLinkPassword(link: ShareLinkRecord, password: string): boolean {
  if (!link.passwordHash) return true;
  return bcrypt.compareSync(password, link.passwordHash);
}
