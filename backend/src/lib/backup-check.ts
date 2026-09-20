import nodemailer from "nodemailer";
import { smtpConfig } from "./config.js";
import { buildRepositoryTree, flattenFiles } from "./file-tree.js";
import {
  listRepositoriesWithNotifications,
  updateLastNotifiedAt,
  type RepositoryRecord,
} from "./repositories.js";

const MIN_HOURS_BETWEEN_REMINDERS = 24;

export class SmtpNotConfiguredError extends Error {}

function transporter() {
  if (!smtpConfig) {
    throw new SmtpNotConfiguredError(
      "SMTP ist auf diesem Server nicht eingerichtet."
    );
  }
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.password } : undefined,
  });
}

export async function sendNotificationEmail(
  to: string,
  subject: string,
  text: string
): Promise<void> {
  await transporter().sendMail({ from: smtpConfig!.from, to, subject, text });
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
  if (!repo.notificationsEnabled || !repo.notifyAfterDays || !repo.email) return;

  const ageInDays = await newestFileAge(repo.id);
  if (ageInDays === null || ageInDays < repo.notifyAfterDays) return;

  if (repo.lastNotifiedAt) {
    const hoursSinceLastNotification =
      (Date.now() - new Date(repo.lastNotifiedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastNotification < MIN_HOURS_BETWEEN_REMINDERS) return;
  }

  try {
    await sendNotificationEmail(
      repo.email,
      "GoodShare: Backup überfällig",
      `Für „${repo.name}“ ist seit ${Math.floor(ageInDays)} Tagen kein neues GoodNotes-Backup angekommen. Bitte kurz prüfen, ob GoodNotes noch sichert.`
    );
    updateLastNotifiedAt(repo.id, new Date().toISOString());
  } catch {
    // A failed send (SMTP temporarily unreachable, etc.) just gets retried
    // on the next scheduled check — nothing else to do here.
  }
}

export async function runBackupChecks(): Promise<void> {
  if (!smtpConfig) return; // nothing to send with
  const repos = listRepositoriesWithNotifications();
  for (const repo of repos) {
    await checkRepository(repo);
  }
}
