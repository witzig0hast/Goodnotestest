import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { resolveSafePath, resolveVersionsPath } from "./storage.js";

const MAX_VERSIONS = 3;

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Copies the current content of a file into its own version folder before
 * it gets overwritten, keeping only the newest MAX_VERSIONS snapshots.
 */
export async function snapshotBeforeOverwrite(
  repositoryId: string,
  relativePath: string,
  currentAbsolutePath: string
): Promise<void> {
  const stat = await fs.stat(currentAbsolutePath).catch(() => null);
  // Skip empty files: WebDAV clients create a fresh file with a brief
  // 0-byte state before writing its real content, which isn't a
  // meaningful "previous version" to keep.
  if (!stat || !stat.isFile() || stat.size === 0) return;

  const versionsDir = resolveVersionsPath(repositoryId, relativePath);
  await fs.mkdir(versionsDir, { recursive: true });
  await fs.copyFile(currentAbsolutePath, path.join(versionsDir, safeTimestamp()));

  const entries = (await fs.readdir(versionsDir)).sort();
  const excess = entries.length - MAX_VERSIONS;
  for (let i = 0; i < excess; i++) {
    await fs.unlink(path.join(versionsDir, entries[i]));
  }
}

export interface VersionInfo {
  timestamp: string;
  size: number;
}

export async function listVersions(
  repositoryId: string,
  relativePath: string
): Promise<VersionInfo[]> {
  const versionsDir = resolveVersionsPath(repositoryId, relativePath);
  if (!existsSync(versionsDir)) return [];

  const entries = await fs.readdir(versionsDir);
  const stats = await Promise.all(
    entries.map(async (name) => ({
      timestamp: name,
      size: (await fs.stat(path.join(versionsDir, name))).size,
    }))
  );
  return stats.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function resolveVersionFile(
  repositoryId: string,
  relativePath: string,
  timestamp: string
): string {
  // The timestamp must be exactly one of the filenames on disk — this
  // keeps it from being usable as a path-traversal vector.
  if (!/^[0-9A-Za-z-]+$/.test(timestamp)) {
    throw new Error("Ungültige Version.");
  }
  const versionsDir = resolveVersionsPath(repositoryId, relativePath);
  const filePath = path.join(versionsDir, timestamp);
  if (!existsSync(filePath)) {
    throw new Error("Diese Version gibt es nicht.");
  }
  return filePath;
}

export function versionDownloadPath(
  repositoryId: string,
  relativePath: string,
  timestamp: string
): string {
  return resolveVersionFile(repositoryId, relativePath, timestamp);
}

/** Restores an old version as the live file — snapshotting the current
 * live content first, so restoring is itself never a one-way trip. */
export async function restoreVersion(
  repositoryId: string,
  relativePath: string,
  timestamp: string
): Promise<void> {
  const versionFile = resolveVersionFile(repositoryId, relativePath, timestamp);
  const liveFile = resolveSafePath(repositoryId, relativePath);

  await snapshotBeforeOverwrite(repositoryId, relativePath, liveFile);
  await fs.copyFile(versionFile, liveFile);
}
