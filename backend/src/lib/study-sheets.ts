import { existsSync, promises as fs } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { db } from "./db.js";
import { generateId } from "./ids.js";
import { resolveSafePath } from "./storage.js";

/**
 * Lernzettel: a named, ordered collection of single pages picked from any
 * number of notebooks ("Formel S. 3 aus Analysis + S. 7 aus Übungsblatt"),
 * composed into one PDF on demand. Pages are stored by path + page number
 * and follow renames/deletes via path-refs.ts.
 */

export const MAX_SHEET_PAGES = 300;

export interface StudySheetPage {
  id: string;
  path: string;
  page: number;
}

export interface StudySheet {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: StudySheetPage[];
}

interface SheetRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function pagesOf(sheetId: string): StudySheetPage[] {
  return (
    db
      .prepare(
        "SELECT id, relative_path, page FROM study_sheet_pages WHERE sheet_id = ? ORDER BY position, rowid"
      )
      .all(sheetId) as { id: string; relative_path: string; page: number }[]
  ).map((r) => ({ id: r.id, path: r.relative_path, page: r.page }));
}

function toSheet(row: SheetRow): StudySheet {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pages: pagesOf(row.id),
  };
}

export function listSheets(repositoryId: string): StudySheet[] {
  const rows = db
    .prepare(
      "SELECT id, name, created_at, updated_at FROM study_sheets WHERE repository_id = ? ORDER BY updated_at DESC"
    )
    .all(repositoryId) as SheetRow[];
  return rows.map(toSheet);
}

export function getSheet(repositoryId: string, id: string): StudySheet | null {
  const row = db
    .prepare("SELECT id, name, created_at, updated_at FROM study_sheets WHERE repository_id = ? AND id = ?")
    .get(repositoryId, id) as SheetRow | undefined;
  return row ? toSheet(row) : null;
}

export function createSheet(repositoryId: string, name: string): StudySheet {
  const id = generateId();
  db.prepare("INSERT INTO study_sheets (id, repository_id, name) VALUES (?, ?, ?)").run(id, repositoryId, name);
  return getSheet(repositoryId, id)!;
}

function touch(id: string): void {
  db.prepare("UPDATE study_sheets SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function renameSheet(repositoryId: string, id: string, name: string): boolean {
  const result = db
    .prepare("UPDATE study_sheets SET name = ?, updated_at = datetime('now') WHERE repository_id = ? AND id = ?")
    .run(name, repositoryId, id);
  return result.changes > 0;
}

export function deleteSheet(repositoryId: string, id: string): boolean {
  return db.prepare("DELETE FROM study_sheets WHERE repository_id = ? AND id = ?").run(repositoryId, id).changes > 0;
}

/** Appends pages; returns false when the sheet would grow beyond MAX_SHEET_PAGES. */
export function addPages(
  repositoryId: string,
  sheetId: string,
  pages: { path: string; page: number }[]
): boolean {
  const count = (
    db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS max FROM study_sheet_pages WHERE sheet_id = ?")
      .get(sheetId) as { n: number; max: number }
  );
  if (count.n + pages.length > MAX_SHEET_PAGES) return false;
  const insert = db.prepare(
    "INSERT INTO study_sheet_pages (id, sheet_id, repository_id, relative_path, page, position) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.transaction(() => {
    pages.forEach((p, i) => insert.run(generateId(), sheetId, repositoryId, p.path, p.page, count.max + i + 1));
    touch(sheetId);
  })();
  return true;
}

export function removePage(sheetId: string, pageId: string): boolean {
  const changed = db.prepare("DELETE FROM study_sheet_pages WHERE sheet_id = ? AND id = ?").run(sheetId, pageId).changes > 0;
  if (changed) touch(sheetId);
  return changed;
}

/** Reorders to exactly the given page ids; ids not in the sheet are ignored. */
export function reorderPages(sheetId: string, pageIds: string[]): void {
  const update = db.prepare("UPDATE study_sheet_pages SET position = ? WHERE sheet_id = ? AND id = ?");
  db.transaction(() => {
    pageIds.forEach((id, i) => update.run(i + 1, sheetId, id));
    touch(sheetId);
  })();
}

/**
 * Builds the PDF. Source notebooks are loaded once each; pages whose file
 * disappeared or that are out of range are skipped (and counted), so one
 * stale entry never blocks the rest.
 */
export async function composeSheetPdf(
  repositoryId: string,
  sheet: StudySheet
): Promise<{ bytes: Uint8Array; skipped: number }> {
  const out = await PDFDocument.create();
  out.setTitle(sheet.name);
  const cache = new Map<string, PDFDocument | null>();
  let skipped = 0;
  for (const entry of sheet.pages) {
    if (!cache.has(entry.path)) {
      try {
        const abs = resolveSafePath(repositoryId, entry.path);
        cache.set(
          entry.path,
          existsSync(abs) ? await PDFDocument.load(await fs.readFile(abs), { ignoreEncryption: true }) : null
        );
      } catch {
        cache.set(entry.path, null);
      }
    }
    const src = cache.get(entry.path);
    if (!src || entry.page < 1 || entry.page > src.getPageCount()) {
      skipped++;
      continue;
    }
    const [copied] = await out.copyPages(src, [entry.page - 1]);
    out.addPage(copied);
  }
  return { bytes: await out.save(), skipped };
}
