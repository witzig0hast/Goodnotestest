import { db } from "./db.js";

export function addFavorite(repositoryId: string, relativePath: string): void {
  db.prepare(
    `INSERT INTO favorites (repository_id, relative_path)
     VALUES (?, ?)
     ON CONFLICT (repository_id, relative_path) DO NOTHING`
  ).run(repositoryId, relativePath);
}

export function removeFavorite(repositoryId: string, relativePath: string): void {
  db.prepare(
    "DELETE FROM favorites WHERE repository_id = ? AND relative_path = ?"
  ).run(repositoryId, relativePath);
}

export function listFavorites(repositoryId: string): string[] {
  const rows = db
    .prepare(
      "SELECT relative_path FROM favorites WHERE repository_id = ? ORDER BY created_at DESC"
    )
    .all(repositoryId) as { relative_path: string }[];
  return rows.map((row) => row.relative_path);
}
