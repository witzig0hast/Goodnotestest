import { Router } from "express";
import { z } from "zod";
import { sendNtfyMessage } from "../lib/backup-check.js";
import { requireSession } from "../middleware/require-session.js";
import {
  clearNotificationSettings,
  findRepositoryById,
  setNotificationSettings,
} from "../lib/repositories.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireSession);

const settingsSchema = z.object({
  ntfyUrl: z.string().trim().url(),
  ntfyTopic: z.string().trim().min(1).max(100),
  notifyAfterDays: z.number().int().min(1).max(90),
});

notificationsRouter.get("/", (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Repository nicht gefunden." });
    return;
  }
  res.json({
    enabled: Boolean(repo.ntfyUrl && repo.ntfyTopic),
    ntfyUrl: repo.ntfyUrl,
    ntfyTopic: repo.ntfyTopic,
    notifyAfterDays: repo.notifyAfterDays,
  });
});

notificationsRouter.post("/", (req, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte ntfy-Adresse, Thema und Anzahl Tage angeben." });
    return;
  }

  setNotificationSettings(req.repositoryId!, parsed.data);
  res.status(201).json({ enabled: true });
});

notificationsRouter.delete("/", (req, res) => {
  clearNotificationSettings(req.repositoryId!);
  res.status(204).end();
});

notificationsRouter.post("/test", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte ntfy-Adresse und Thema angeben." });
    return;
  }

  try {
    await sendNtfyMessage(
      parsed.data.ntfyUrl,
      parsed.data.ntfyTopic,
      "Diese Testnachricht bestätigt, dass GoodShare dich hier erreichen kann.",
      "GoodShare: Testbenachrichtigung"
    );
    res.json({ sent: true });
  } catch {
    res.status(400).json({
      error: "Testnachricht konnte nicht gesendet werden. Bitte Adresse und Thema prüfen.",
    });
  }
});
