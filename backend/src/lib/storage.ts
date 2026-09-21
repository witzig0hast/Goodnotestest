import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export function repositoryDir(repositoryId: string): string {
  return path.join(path.resolve(config.filesDir), repositoryId);
}

export function ensureRepositoryDir(repositoryId: string): string {
  const dir = repositoryDir(repositoryId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolves a relative path (as sent by a client, e.g. "Ordner/Notiz.pdf")
 * against a repository's own directory, and throws if the result would
 * escape that directory (e.g. via "../..").
 */
export function resolveSafePath(repositoryId: string, relativePath: string): string {
  return resolveSafePathIn(repositoryDir(repositoryId), relativePath);
}

function resolveSafePathIn(base: string, relativePath: string): string {
  const target = path.resolve(base, "." + path.sep + relativePath.replace(/^\/+/, ""));

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Ungültiger Pfad.");
  }

  return target;
}

// Versions and thumbnails live in their own directory trees, siblings of
// the repository's own files — never inside it. That way they're
// automatically invisible to the file browser, search, ZIP downloads, and
// Nextcloud sync, without needing every one of those to special-case a
// hidden folder.
export function repositoryVersionsDir(repositoryId: string): string {
  return path.join(path.resolve(config.versionsDir), repositoryId);
}

export function resolveVersionsPath(repositoryId: string, relativePath: string): string {
  return resolveSafePathIn(repositoryVersionsDir(repositoryId), relativePath);
}

export function repositoryThumbnailsDir(repositoryId: string): string {
  return path.join(path.resolve(config.thumbnailsDir), repositoryId);
}

export function resolveThumbnailPath(repositoryId: string, relativePath: string): string {
  return resolveSafePathIn(repositoryThumbnailsDir(repositoryId), relativePath);
}

/** A filesystem-safe name for a single path segment (no slashes, no ".."). */
export function isValidSegmentName(name: string): boolean {
  return name.length > 0 && !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
}
