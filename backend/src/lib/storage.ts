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
  const base = repositoryDir(repositoryId);
  const target = path.resolve(base, "." + path.sep + relativePath.replace(/^\/+/, ""));

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Ungültiger Pfad.");
  }

  return target;
}
