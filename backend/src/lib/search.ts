import { PDFParse } from "pdf-parse";
import { promises as fs } from "node:fs";
import { db } from "./db.js";
import { buildRepositoryTree, flattenFiles, type TreeNode } from "./file-tree.js";
import { resolveSafePath } from "./storage.js";

const MAX_INDEXABLE_SIZE = 20 * 1024 * 1024; // 20 MB — keeps a search from stalling on huge scans

interface IndexRow {
  mtime: string;
  text: string;
}

async function extractPdfText(absolutePath: string): Promise<string> {
  const buffer = await fs.readFile(absolutePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function getIndexedText(
  repositoryId: string,
  node: TreeNode
): Promise<string | null> {
  if (!node.name.toLowerCase().endsWith(".pdf")) return null;
  if ((node.size ?? 0) > MAX_INDEXABLE_SIZE) return null;

  const mtime = node.modifiedAt ?? "";
  const cached = db
    .prepare(
      "SELECT mtime, text FROM file_text_index WHERE repository_id = ? AND relative_path = ?"
    )
    .get(repositoryId, node.path) as IndexRow | undefined;

  if (cached && cached.mtime === mtime) return cached.text;

  let text: string;
  try {
    text = await extractPdfText(resolveSafePath(repositoryId, node.path));
  } catch {
    // Password-protected, corrupted, or otherwise unreadable PDFs just
    // don't get searchable content — the file itself is still listed.
    return null;
  }

  db.prepare(
    `INSERT INTO file_text_index (repository_id, relative_path, mtime, text)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (repository_id, relative_path) DO UPDATE SET mtime = excluded.mtime, text = excluded.text, indexed_at = datetime('now')`
  ).run(repositoryId, node.path, mtime, text);

  return text;
}

function snippetAround(text: string, index: number, query: string): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + query.length + 40);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

export interface SearchResult {
  path: string;
  name: string;
  matchedIn: "filename" | "content";
  snippet?: string;
}

export async function searchRepository(
  repositoryId: string,
  query: string
): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tree = await buildRepositoryTree(repositoryId);
  const files = flattenFiles(tree);
  const results: SearchResult[] = [];

  for (const file of files) {
    if (file.name.toLowerCase().includes(q)) {
      results.push({ path: file.path, name: file.name, matchedIn: "filename" });
      continue;
    }

    const text = await getIndexedText(repositoryId, file);
    if (!text) continue;

    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(q);
    if (index !== -1) {
      results.push({
        path: file.path,
        name: file.name,
        matchedIn: "content",
        snippet: snippetAround(text, index, q),
      });
    }
  }

  return results;
}

export function forgetIndexForRepository(repositoryId: string): void {
  db.prepare("DELETE FROM file_text_index WHERE repository_id = ?").run(repositoryId);
}
