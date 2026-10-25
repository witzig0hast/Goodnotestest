import { existsSync } from "node:fs";
import { db } from "./db.js";
import { generateId } from "./ids.js";
import { resolveSafePath } from "./storage.js";

/**
 * Where you left off: the last page per notebook (so the viewer reopens
 * there) and a "recently viewed" list, plus page bookmarks with an
 * optional note ("Formel S. 12"). All keyed by path, kept in sync on
 * rename/delete by path-refs.ts.
 */

export function recordView(repositoryId: string, relativePath: string, page: number, pageCount: number | null): void {
  db.prepare(
    `INSERT INTO recent_views (repository_id, relative_path, last_page, page_count, viewed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (repository_id, relative_path) DO UPDATE SET
       last_page = excluded.last_page,
       page_count = COALESCE(excluded.page_count, recent_views.page_count),
       viewed_at = excluded.viewed_at`
  ).run(repositoryId, relativePath, page, pageCount, new Date().toISOString());
}

function exists(repositoryId: string, relativePath: string): boolean {
  try {
    return existsSync(resolveSafePath(repositoryId, relativePath));
  } catch {
    return false;
  }
}

export interface RecentView {
  path: string;
  lastPage: number;
  pageCount: number | null;
  viewedAt: string;
}

export function listRecent(repositoryId: string, limit = 8): RecentView[] {
  const rows = db
    .prepare(
      `SELECT relative_path, last_page, page_count, viewed_at FROM recent_views
       WHERE repository_id = ? ORDER BY viewed_at DESC LIMIT ?`
    )
    .all(repositoryId, limit * 2) as {
    relative_path: string;
    last_page: number;
    page_count: number | null;
    viewed_at: string;
  }[];
  return rows
    .filter((r) => exists(repositoryId, r.relative_path))
    .slice(0, limit)
    .map((r) => ({ path: r.relative_path, lastPage: r.last_page, pageCount: r.page_count, viewedAt: r.viewed_at }));
}

export function lastPage(repositoryId: string, relativePath: string): number | null {
  const row = db
    .prepare("SELECT last_page FROM recent_views WHERE repository_id = ? AND relative_path = ?")
    .get(repositoryId, relativePath) as { last_page: number } | undefined;
  return row?.last_page ?? null;
}

export interface Bookmark {
  id: string;
  path: string;
  page: number;
  note: string | null;
  createdAt: string;
}

interface BookmarkRow {
  id: string;
  relative_path: string;
  page: number;
  note: string | null;
  created_at: string;
}

const toBookmark = (r: BookmarkRow): Bookmark => ({
  id: r.id,
  path: r.relative_path,
  page: r.page,
  note: r.note,
  createdAt: r.created_at,
});

export function listBookmarks(repositoryId: string, relativePath?: string): Bookmark[] {
  const rows = relativePath
    ? (db
        .prepare("SELECT * FROM page_bookmarks WHERE repository_id = ? AND relative_path = ? ORDER BY page")
        .all(repositoryId, relativePath) as BookmarkRow[])
    : (db
        .prepare("SELECT * FROM page_bookmarks WHERE repository_id = ? ORDER BY created_at DESC")
        .all(repositoryId) as BookmarkRow[]);
  return rows.map(toBookmark);
}

export function addBookmark(repositoryId: string, relativePath: string, page: number, note: string | null): Bookmark {
  const id = generateId();
  db.prepare(
    "INSERT INTO page_bookmarks (id, repository_id, relative_path, page, note) VALUES (?, ?, ?, ?, ?)"
  ).run(id, repositoryId, relativePath, page, note);
  return toBookmark(db.prepare("SELECT * FROM page_bookmarks WHERE id = ?").get(id) as BookmarkRow);
}

export function updateBookmark(repositoryId: string, id: string, note: string | null): boolean {
  return (
    db.prepare("UPDATE page_bookmarks SET note = ? WHERE id = ? AND repository_id = ?").run(note, id, repositoryId)
      .changes > 0
  );
}

export function deleteBookmark(repositoryId: string, id: string): boolean {
  return db.prepare("DELETE FROM page_bookmarks WHERE id = ? AND repository_id = ?").run(id, repositoryId).changes > 0;
}
