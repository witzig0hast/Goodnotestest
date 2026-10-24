import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { generateTrashItemId } from "./ids.js";
import { deletePathReferences } from "./path-refs.js";
import {
  repositoryTrashDir,
  resolveSafePath,
  resolveThumbnailPath,
  resolveVersionsPath,
} from "./storage.js";

/**
 * Deleting moves things into a per-account trash instead of removing them,
 * for `config.trashRetentionDays` days. Layout on disk:
 *
 *   <trash>/<repositoryId>/<itemId>/content/<name>   the file or folder itself
 *   <trash>/<repositoryId>/<itemId>/versions         its version history, if any
 *
 * Like versions and thumbnails, the trash lives outside the repository's
 * own directory, so file browser, search, ZIP downloads and WebDAV never
 * see it.
 */

export type DeletedBy = "web" | "goodnotes";

export interface TrashItem {
  id: string;
  originalPath: string;
  name: string;
  isDirectory: boolean;
  size: number;
  deletedBy: DeletedBy;
  deletedAt: string;
  expiresAt: string;
}

interface TrashRow {
  id: string;
  original_path: string;
  is_directory: number;
  size: number;
  deleted_by: DeletedBy;
  deleted_at: string;
}

function itemDir(repositoryId: string, id: string): string {
  return path.join(repositoryTrashDir(repositoryId), id);
}

// SQLite's datetime('now') has no timezone marker — it's UTC.
function parseSqliteDate(value: string): Date {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
}

function toItem(row: TrashRow): TrashItem {
  const deletedAt = parseSqliteDate(row.deleted_at);
  return {
    id: row.id,
    originalPath: row.original_path,
    name: path.basename(row.original_path),
    isDirectory: row.is_directory === 1,
    size: row.size,
    deletedBy: row.deleted_by,
    deletedAt: deletedAt.toISOString(),
    expiresAt: new Date(
      deletedAt.getTime() + config.trashRetentionDays * 24 * 60 * 60 * 1000
    ).toISOString(),
  };
}

async function totalSize(absolutePath: string): Promise<number> {
  const stat = await fs.stat(absolutePath);
  if (!stat.isDirectory()) return stat.size;
  const entries = await fs.readdir(absolutePath);
  const sizes = await Promise.all(entries.map((e) => totalSize(path.join(absolutePath, e))));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Moves `absolutePath` across directories, falling back to copy+delete across filesystems. */
async function moveAcross(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fs.cp(from, to, { recursive: true });
    await fs.rm(from, { recursive: true, force: true });
  }
}

export async function moveToTrash(
  repositoryId: string,
  relativePath: string,
  deletedBy: DeletedBy
): Promise<TrashItem> {
  const normalized = relativePath.replace(/^\/+|\/+$/g, "");
  const absolutePath = resolveSafePath(repositoryId, normalized);
  const stat = await fs.stat(absolutePath);
  const size = await totalSize(absolutePath).catch(() => 0);

  const id = generateTrashItemId();
  const dir = itemDir(repositoryId, id);
  await moveAcross(absolutePath, path.join(dir, "content", path.basename(absolutePath)));

  const versions = resolveVersionsPath(repositoryId, normalized);
  if (existsSync(versions)) await moveAcross(versions, path.join(dir, "versions"));
  await fs.rm(resolveThumbnailPath(repositoryId, normalized), { recursive: true, force: true });
  await fs.rm(resolveThumbnailPath(repositoryId, `${normalized}.png`), { force: true });
  deletePathReferences(repositoryId, normalized);

  db.prepare(
    `INSERT INTO trash_items (id, repository_id, original_path, is_directory, size, deleted_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, repositoryId, normalized, stat.isDirectory() ? 1 : 0, size, deletedBy);

  return toItem(
    db.prepare("SELECT * FROM trash_items WHERE id = ?").get(id) as TrashRow
  );
}

export function listTrash(repositoryId: string): TrashItem[] {
  const rows = db
    .prepare("SELECT * FROM trash_items WHERE repository_id = ? ORDER BY deleted_at DESC, rowid DESC")
    .all(repositoryId) as TrashRow[];
  return rows.map(toItem);
}

function findRow(repositoryId: string, id: string): TrashRow | undefined {
  return db
    .prepare("SELECT * FROM trash_items WHERE id = ? AND repository_id = ?")
    .get(id, repositoryId) as TrashRow | undefined;
}

/** "Notiz.pdf" → "Notiz (wiederhergestellt).pdf", "… (wiederhergestellt 2).pdf", … */
function freeRestorePath(repositoryId: string, originalPath: string, isDirectory: boolean): string {
  if (!existsSync(resolveSafePath(repositoryId, originalPath))) return originalPath;
  const dir = path.posix.dirname(originalPath);
  const ext = isDirectory ? "" : path.posix.extname(originalPath);
  const base = path.posix.basename(originalPath, ext);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " (wiederhergestellt)" : ` (wiederhergestellt ${n})`;
    const name = `${base}${suffix}${ext}`;
    const candidate = dir === "." ? name : `${dir}/${name}`;
    if (!existsSync(resolveSafePath(repositoryId, candidate))) return candidate;
  }
}

export class TrashItemNotFoundError extends Error {}

/** Puts an item back where it was (or next to it, if that name is taken now). */
export async function restoreFromTrash(repositoryId: string, id: string): Promise<string> {
  const row = findRow(repositoryId, id);
  if (!row) throw new TrashItemNotFoundError("Nicht im Papierkorb gefunden.");

  const dir = itemDir(repositoryId, id);
  const content = path.join(dir, "content", path.basename(row.original_path));
  const target = freeRestorePath(repositoryId, row.original_path, row.is_directory === 1);
  await moveAcross(content, resolveSafePath(repositoryId, target));

  const versions = path.join(dir, "versions");
  const versionsTarget = resolveVersionsPath(repositoryId, target);
  if (existsSync(versions) && !existsSync(versionsTarget)) {
    await moveAcross(versions, versionsTarget);
  }

  await fs.rm(dir, { recursive: true, force: true });
  db.prepare("DELETE FROM trash_items WHERE id = ?").run(id);
  return target;
}

export async function deleteFromTrash(repositoryId: string, id: string): Promise<void> {
  const row = findRow(repositoryId, id);
  if (!row) throw new TrashItemNotFoundError("Nicht im Papierkorb gefunden.");
  await fs.rm(itemDir(repositoryId, id), { recursive: true, force: true });
  db.prepare("DELETE FROM trash_items WHERE id = ?").run(id);
}

export async function emptyTrash(repositoryId: string): Promise<number> {
  const items = listTrash(repositoryId);
  for (const item of items) await deleteFromTrash(repositoryId, item.id);
  return items.length;
}

/** Run periodically: drops everything older than the retention period. */
export async function purgeExpiredTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - config.trashRetentionDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const rows = db
    .prepare("SELECT id, repository_id FROM trash_items WHERE deleted_at < ?")
    .all(cutoff) as { id: string; repository_id: string }[];
  for (const row of rows) {
    await deleteFromTrash(row.repository_id, row.id).catch(() => {});
  }
}
