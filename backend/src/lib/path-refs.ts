import { db } from "./db.js";

/**
 * Tables that reference a file/folder by its relative path within a
 * repository, and so need to be kept in sync whenever that path is
 * deleted or renamed (a rename covers a folder rename affecting every
 * descendant, since "Ordner" also matches "Ordner/Unterordner/Datei.pdf").
 */
const PATH_REFERENCING_TABLES = ["file_text_index", "favorites"] as const;

export function deletePathReferences(repositoryId: string, relativePath: string): void {
  for (const table of PATH_REFERENCING_TABLES) {
    db.prepare(
      `DELETE FROM ${table} WHERE repository_id = ? AND (relative_path = ? OR relative_path LIKE ?)`
    ).run(repositoryId, relativePath, `${relativePath}/%`);
  }
}

export function renamePathReferences(
  repositoryId: string,
  oldPath: string,
  newPath: string
): void {
  // The destination is guaranteed free on disk (rename would have failed
  // otherwise), but stale cache rows could already sit at that path — drop
  // them first so the rename below can't collide with the primary key.
  deletePathReferences(repositoryId, newPath);

  for (const table of PATH_REFERENCING_TABLES) {
    db.prepare(
      `UPDATE ${table} SET relative_path = ? WHERE repository_id = ? AND relative_path = ?`
    ).run(newPath, repositoryId, oldPath);

    db.prepare(
      `UPDATE ${table}
       SET relative_path = ? || substr(relative_path, ? + 1)
       WHERE repository_id = ? AND relative_path LIKE ?`
    ).run(newPath, oldPath.length, repositoryId, `${oldPath}/%`);
  }
}
