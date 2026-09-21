import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { deletePathReferences, renamePathReferences } from "./path-refs.js";
import {
  resolveSafePath,
  resolveThumbnailPath,
  resolveVersionsPath,
  isValidSegmentName,
} from "./storage.js";

export class InvalidPathError extends Error {}
export class NotFoundError extends Error {}

export async function deleteEntry(repositoryId: string, relativePath: string): Promise<void> {
  if (!relativePath) throw new InvalidPathError("Kein Pfad angegeben.");

  const absolutePath = resolveSafePath(repositoryId, relativePath);
  if (!existsSync(absolutePath)) throw new NotFoundError("Nicht gefunden.");

  await fs.rm(absolutePath, { recursive: true, force: true });
  await fs.rm(resolveVersionsPath(repositoryId, relativePath), { recursive: true, force: true });
  await fs.rm(resolveThumbnailPath(repositoryId, relativePath), { recursive: true, force: true });
  deletePathReferences(repositoryId, relativePath);
}

export async function renameEntry(
  repositoryId: string,
  relativePath: string,
  newName: string
): Promise<string> {
  if (!relativePath) throw new InvalidPathError("Kein Pfad angegeben.");
  if (!isValidSegmentName(newName)) {
    throw new InvalidPathError("Ungültiger Name.");
  }

  const oldAbsolute = resolveSafePath(repositoryId, relativePath);
  if (!existsSync(oldAbsolute)) throw new NotFoundError("Nicht gefunden.");

  const parentRelative = path.dirname(relativePath);
  const newRelative = parentRelative === "." ? newName : `${parentRelative}/${newName}`;
  const newAbsolute = resolveSafePath(repositoryId, newRelative);

  if (existsSync(newAbsolute)) {
    throw new InvalidPathError("Es gibt hier schon etwas mit diesem Namen.");
  }

  await fs.rename(oldAbsolute, newAbsolute);

  const oldVersions = resolveVersionsPath(repositoryId, relativePath);
  if (existsSync(oldVersions)) {
    const newVersions = resolveVersionsPath(repositoryId, newRelative);
    await fs.mkdir(path.dirname(newVersions), { recursive: true });
    await fs.rename(oldVersions, newVersions);
  }

  const oldThumb = resolveThumbnailPath(repositoryId, relativePath);
  if (existsSync(oldThumb)) {
    const newThumb = resolveThumbnailPath(repositoryId, newRelative);
    await fs.mkdir(path.dirname(newThumb), { recursive: true });
    await fs.rename(oldThumb, newThumb);
  }

  renamePathReferences(repositoryId, relativePath, newRelative);

  return newRelative;
}
