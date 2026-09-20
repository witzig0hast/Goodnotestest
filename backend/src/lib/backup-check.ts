import { buildRepositoryTree, flattenFiles } from "./file-tree.js";
import {
  listRepositoriesWithNotifications,
  updateLastNotifiedAt,
  type RepositoryRecord,
} from "./repositories.js";

const MIN_HOURS_BETWEEN_REMINDERS = 24;

export async function sendNtfyMessage(
  ntfyUrl: string,
  ntfyTopic: string,
  message: string,
  title: string
): Promise<void> {
  const url = `${ntfyUrl.replace(/\/+$/, "")}/${ntfyTopic}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Title: title, Priority: "default" },
    body: message,
  });
  if (!res.ok) {
    throw new Error(`ntfy antwortete mit ${res.status}`);
  }
}

async function newestFileAge(repositoryId: string): Promise<number | null> {
  const tree = await buildRepositoryTree(repositoryId);
  const files = flattenFiles(tree);
  if (files.length === 0) return null;

  const newest = files.reduce((latest, file) => {
    const time = file.modifiedAt ? new Date(file.modifiedAt).getTime() : 0;
    return Math.max(latest, time);
  }, 0);

  return (Date.now() - newest) / (1000 * 60 * 60 * 24);
}

async function checkRepository(repo: RepositoryRecord): Promise<void> {
  if (!repo.ntfyUrl || !repo.ntfyTopic || !repo.notifyAfterDays) return;

  const ageInDays = await newestFileAge(repo.id);
  if (ageInDays === null || ageInDays < repo.notifyAfterDays) return;

  if (repo.lastNotifiedAt) {
    const hoursSinceLastNotification =
      (Date.now() - new Date(repo.lastNotifiedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastNotification < MIN_HOURS_BETWEEN_REMINDERS) return;
  }

  try {
    await sendNtfyMessage(
      repo.ntfyUrl,
      repo.ntfyTopic,
      `Für „${repo.name}“ ist seit ${Math.floor(ageInDays)} Tagen kein neues GoodNotes-Backup angekommen. Bitte kurz prüfen, ob GoodNotes noch sichert.`,
      "GoodShare: Backup überfällig"
    );
    updateLastNotifiedAt(repo.id, new Date().toISOString());
  } catch {
    // A failed push (e.g. ntfy temporarily unreachable) just gets retried
    // on the next scheduled check — nothing else to do here.
  }
}

export async function runBackupChecks(): Promise<void> {
  const repos = listRepositoriesWithNotifications();
  for (const repo of repos) {
    await checkRepository(repo);
  }
}
