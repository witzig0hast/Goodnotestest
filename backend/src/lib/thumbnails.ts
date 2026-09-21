import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { db } from "./db.js";
import { resolveSafePath, resolveThumbnailPath } from "./storage.js";

const THUMBNAIL_WIDTH = 240;

interface ThumbnailMetaRow {
  mtime: string;
}

/**
 * Renders (and caches) a small PNG preview of a PDF's first page. Returns
 * null for anything that isn't a PDF, or that fails to render (password
 * protected, corrupted, etc.) — callers fall back to a generic icon.
 */
export async function getThumbnailPath(
  repositoryId: string,
  relativePath: string
): Promise<string | null> {
  if (!relativePath.toLowerCase().endsWith(".pdf")) return null;

  const absolutePath = resolveSafePath(repositoryId, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat || !stat.isFile()) return null;

  const mtime = stat.mtime.toISOString();
  const thumbPath = resolveThumbnailPath(repositoryId, `${relativePath}.png`);

  const cached = db
    .prepare(
      "SELECT mtime FROM thumbnails_meta WHERE repository_id = ? AND relative_path = ?"
    )
    .get(repositoryId, relativePath) as ThumbnailMetaRow | undefined;

  if (cached && cached.mtime === mtime && existsSync(thumbPath)) {
    return thumbPath;
  }

  const parser = new PDFParse({ data: await fs.readFile(absolutePath) });
  try {
    const result = await parser.getScreenshot({
      first: 1,
      desiredWidth: THUMBNAIL_WIDTH,
      imageBuffer: true,
    });
    const firstPage = result.pages[0];
    if (!firstPage?.data) return null;

    await fs.mkdir(path.dirname(thumbPath), { recursive: true });
    await fs.writeFile(thumbPath, Buffer.from(firstPage.data));

    db.prepare(
      `INSERT INTO thumbnails_meta (repository_id, relative_path, mtime)
       VALUES (?, ?, ?)
       ON CONFLICT (repository_id, relative_path) DO UPDATE SET mtime = excluded.mtime`
    ).run(repositoryId, relativePath, mtime);

    return thumbPath;
  } catch {
    return null;
  } finally {
    await parser.destroy();
  }
}
