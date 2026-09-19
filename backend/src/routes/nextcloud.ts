import { Router } from "express";
import { z } from "zod";
import {
  testNextcloudConnection,
  syncRepositoryToNextcloud,
} from "../lib/nextcloud.js";
import { requireSession } from "../middleware/require-session.js";
import {
  clearNextcloudConnection,
  findRepositoryById,
  getNextcloudCredentials,
  setNextcloudConnection,
} from "../lib/repositories.js";

export const nextcloudRouter = Router();

nextcloudRouter.use(requireSession);

const connectSchema = z.object({
  url: z.string().trim().url(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

nextcloudRouter.get("/", (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Repository nicht gefunden." });
    return;
  }
  res.json({
    connected: Boolean(repo.nextcloudUrl),
    url: repo.nextcloudUrl,
    username: repo.nextcloudUsername,
  });
});

nextcloudRouter.post("/", async (req, res) => {
  const parsed = connectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte URL, Benutzername und Passwort angeben." });
    return;
  }

  try {
    await testNextcloudConnection(parsed.data);
  } catch {
    res.status(400).json({
      error:
        "Verbindung fehlgeschlagen. Bitte URL, Benutzername und (App-)Passwort prüfen.",
    });
    return;
  }

  setNextcloudConnection(req.repositoryId!, parsed.data);
  res.status(201).json({ connected: true });
});

nextcloudRouter.delete("/", (req, res) => {
  clearNextcloudConnection(req.repositoryId!);
  res.status(204).end();
});

nextcloudRouter.post("/sync", async (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Repository nicht gefunden." });
    return;
  }

  const credentials = getNextcloudCredentials(repo);
  if (!credentials) {
    res.status(400).json({ error: "Keine Nextcloud verbunden." });
    return;
  }

  try {
    const result = await syncRepositoryToNextcloud(repo.id, credentials);
    res.json(result);
  } catch {
    res.status(502).json({ error: "Export zur Nextcloud ist fehlgeschlagen." });
  }
});
