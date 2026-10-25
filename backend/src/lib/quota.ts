import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { repositoryDir } from "./storage.js";

/**
 * Per-account storage limits. Only the account's own files count — not
 * the version history, thumbnails or the trash, which the account owner
 * can't directly manage from GoodNotes.
 */

const USAGE_CACHE_MS = 30 * 1000;
const usageCache = new Map<string, { bytes: number; at: number }>();

async function directorySize(dir: string): Promise<number> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return directorySize(full);
      const stat = await fs.stat(full).catch(() => null);
      return stat?.size ?? 0;
    })
  );
  return sizes.reduce((a, b) => a + b, 0);
}

export async function getUsageBytes(repositoryId: string, fresh = false): Promise<number> {
  const cached = usageCache.get(repositoryId);
  if (!fresh && cached && Date.now() - cached.at < USAGE_CACHE_MS) return cached.bytes;
  const bytes = await directorySize(repositoryDir(repositoryId));
  usageCache.set(repositoryId, { bytes, at: Date.now() });
  return bytes;
}

/** Counts an accepted upload against the cached usage until the next full recount. */
export function noteUpload(repositoryId: string, bytes: number): void {
  const cached = usageCache.get(repositoryId);
  if (cached) cached.bytes += bytes;
}

export function getIndividualQuota(repositoryId: string): number | null {
  const row = db
    .prepare("SELECT storage_quota_bytes FROM repositories WHERE id = ?")
    .get(repositoryId) as { storage_quota_bytes: number | null } | undefined;
  return row?.storage_quota_bytes ?? null;
}

/** The limit that applies: the account's own one, else the server default, else none. */
export function getQuotaBytes(repositoryId: string): number | null {
  return getIndividualQuota(repositoryId) ?? config.defaultQuotaBytes;
}

export function setQuotaBytes(repositoryId: string, bytes: number | null): void {
  db.prepare("UPDATE repositories SET storage_quota_bytes = ? WHERE id = ?").run(bytes, repositoryId);
}

/** Would adding `incomingBytes` push the account over its limit? */
export async function wouldExceedQuota(repositoryId: string, incomingBytes: number): Promise<boolean> {
  const quota = getQuotaBytes(repositoryId);
  if (quota === null) return false;
  const usage = await getUsageBytes(repositoryId);
  return usage + incomingBytes > quota;
}

export async function quotaSummary(repositoryId: string) {
  return {
    usageBytes: await getUsageBytes(repositoryId),
    quotaBytes: getQuotaBytes(repositoryId),
  };
}
