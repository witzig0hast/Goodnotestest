import nodemailer from "nodemailer";
import { config, smtpConfig } from "./config.js";
import { buildRepositoryTree, flattenFiles } from "./file-tree.js";
import {
  listRepositoriesWithNotifications,
  listRepositoriesWithWeeklyDigest,
  updateLastDigestSentAt,
  updateLastNotifiedAt,
  type RepositoryRecord,
} from "./repositories.js";
import { createShareLink } from "./share-links.js";

const MIN_HOURS_BETWEEN_REMINDERS = 24;
const DIGEST_INTERVAL_DAYS = 7;
const DIGEST_LINK_VALID_DAYS = 7;

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

async function sendWeeklyDigest(repo: RepositoryRecord): Promise<void> {
  if (!repo.weeklyDigestEnabled || !repo.email) return;

  if (repo.lastDigestSentAt) {
    const daysSinceLastDigest =
      (Date.now() - new Date(repo.lastDigestSentAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastDigest < DIGEST_INTERVAL_DAYS) return;
  }

  const tree = await buildRepositoryTree(repo.id);
  if (flattenFiles(tree).length === 0) return; // nothing to send yet

  try {
    const link = createShareLink({
      repositoryId: repo.id,
      items: [{ relativePath: "", isDirectory: true }],
      password: null,
      expiresInDays: DIGEST_LINK_VALID_DAYS,
    });

    await sendNotificationEmail(
      repo.email,
      "GoodShare: dein wöchentliches Backup",
      `Hier ist dein wöchentlicher Download-Link für „${repo.name}“ — er funktioniert ${DIGEST_LINK_VALID_DAYS} Tage:\n\n${config.frontendOrigin}/s/${link.id}`
    );
    updateLastDigestSentAt(repo.id, new Date().toISOString());
  } catch {
    // Retried on the next scheduled check.
  }
}

export async function runBackupChecks(): Promise<void> {
  if (!smtpConfig) return; // nothing to send with

  for (const repo of listRepositoriesWithNotifications()) {
    await checkRepository(repo);
  }
  for (const repo of listRepositoriesWithWeeklyDigest()) {
    await sendWeeklyDigest(repo);
  }
}
