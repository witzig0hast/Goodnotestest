import { Router } from "express";
import { z } from "zod";
import { SmtpNotConfiguredError, sendNotificationEmail } from "../lib/backup-check.js";
import { requireSession } from "../middleware/require-session.js";
import {
  clearNotificationSettings,
  findRepositoryById,
  setNotificationSettings,
  setWeeklyDigestEnabled,
} from "../lib/repositories.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireSession);

const settingsSchema = z.object({
  notifyAfterDays: z.number().int().min(1).max(90),
});

notificationsRouter.get("/", (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Repository nicht gefunden." });
    return;
  }
  res.json({
    enabled: repo.notificationsEnabled,
    notifyAfterDays: repo.notifyAfterDays,
    weeklyDigestEnabled: repo.weeklyDigestEnabled,
  });
});

notificationsRouter.post("/", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte eine gültige Anzahl Tage angeben." });
    return;
  }

  setNotificationSettings(req.repositoryId!, parsed.data);
  res.status(201).json({ enabled: true });
});

notificationsRouter.delete("/", (req, res) => {
  clearNotificationSettings(req.repositoryId!);
  res.status(204).end();
});

const digestSchema = z.object({ enabled: z.boolean() });

notificationsRouter.post("/digest", (req, res) => {
  const parsed = digestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Angabe." });
    return;
  }
  setWeeklyDigestEnabled(req.repositoryId!, parsed.data.enabled);
  res.json({ weeklyDigestEnabled: parsed.data.enabled });
});

notificationsRouter.post("/test", async (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo || !repo.email) {
    res.status(404).json({ error: "Repository nicht gefunden." });
    return;
  }

  try {
    await sendNotificationEmail(
      repo.email,
      "GoodShare: Testbenachrichtigung",
      "Diese Testnachricht bestätigt, dass GoodShare dich per E-Mail erreichen kann."
    );
    res.json({ sent: true });
  } catch (err) {
    res.status(err instanceof SmtpNotConfiguredError ? 501 : 400).json({
      error:
        err instanceof SmtpNotConfiguredError
          ? "Der Betreiber dieses Servers hat noch keinen E-Mail-Versand eingerichtet."
          : "Testmail konnte nicht gesendet werden.",
    });
  }
});
