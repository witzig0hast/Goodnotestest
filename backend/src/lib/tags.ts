import { db } from "./db.js";
import { generateTagId } from "./ids.js";

/**
 * Colored labels that cut across the folder structure GoodNotes imposes,
 * e.g. "Prüfungsrelevant" on notes from several subjects. Tags reference
 * files/folders by path (kept in sync on rename/delete via path-refs.ts).
 */

export const TAG_COLORS = ["green", "blue", "purple", "pink", "red", "orange", "yellow", "gray"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
}

export class TagExistsError extends Error {}

export function listTags(repositoryId: string): Tag[] {
  return db
    .prepare("SELECT id, name, color FROM tags WHERE repository_id = ? ORDER BY name COLLATE NOCASE")
    .all(repositoryId) as Tag[];
}

export function createTag(repositoryId: string, name: string, color: TagColor): Tag {
  const existing = db
    .prepare("SELECT 1 FROM tags WHERE repository_id = ? AND name = ? COLLATE NOCASE")
    .get(repositoryId, name);
  if (existing) throw new TagExistsError("Diesen Tag gibt es schon.");
  const id = generateTagId();
  db.prepare("INSERT INTO tags (id, repository_id, name, color) VALUES (?, ?, ?, ?)").run(
    id,
    repositoryId,
    name,
    color
  );
  return { id, name, color };
}

export function updateTag(repositoryId: string, id: string, patch: { name?: string; color?: TagColor }): boolean {
  const tag = db.prepare("SELECT 1 FROM tags WHERE id = ? AND repository_id = ?").get(id, repositoryId);
  if (!tag) return false;
  if (patch.name) db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(patch.name, id);
  if (patch.color) db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(patch.color, id);
  return true;
}

export function deleteTag(repositoryId: string, id: string): boolean {
  return db.prepare("DELETE FROM tags WHERE id = ? AND repository_id = ?").run(id, repositoryId).changes > 0;
}

function ownsTag(repositoryId: string, tagId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM tags WHERE id = ? AND repository_id = ?").get(tagId, repositoryId));
}

export function assignTag(repositoryId: string, tagId: string, relativePath: string): boolean {
  if (!ownsTag(repositoryId, tagId)) return false;
  db.prepare(
    "INSERT OR IGNORE INTO file_tags (repository_id, relative_path, tag_id) VALUES (?, ?, ?)"
  ).run(repositoryId, relativePath, tagId);
  return true;
}

export function unassignTag(repositoryId: string, tagId: string, relativePath: string): boolean {
  if (!ownsTag(repositoryId, tagId)) return false;
  db.prepare("DELETE FROM file_tags WHERE repository_id = ? AND relative_path = ? AND tag_id = ?").run(
    repositoryId,
    relativePath,
    tagId
  );
  return true;
}

/** path → tag ids */
export function listAssignments(repositoryId: string): Record<string, string[]> {
  const rows = db
    .prepare("SELECT relative_path, tag_id FROM file_tags WHERE repository_id = ?")
    .all(repositoryId) as { relative_path: string; tag_id: string }[];
  const result: Record<string, string[]> = {};
  for (const row of rows) (result[row.relative_path] ??= []).push(row.tag_id);
  return result;
}
