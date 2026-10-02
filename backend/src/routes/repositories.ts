import { Router } from "express";
import { z } from "zod";
import { clearSession, issueSession } from "../lib/auth-token.js";
import {
  createRepository,
  deleteRepository,
  findRepositoryByEmail,
  findRepositoryById,
  regeneratePin,
  regenerateWebdavPassword,
  verifyPassword,
} from "../lib/repositories.js";
import { removeAllRepositoryData } from "../lib/storage.js";
import { requireSession } from "../middleware/require-session.js";
import { registrationLimiter } from "../middleware/rate-limit.js";

export const repositoriesRouter = Router();

const createRepositorySchema = z.object({
  name: z.string().trim().min(1).max(80).default("Meine Notizen"),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen haben."),
});

repositoriesRouter.post("/", registrationLimiter, (req, res) => {
  const parsed = createRepositorySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ungültige Angaben." });
    return;
  }

  if (findRepositoryByEmail(parsed.data.email)) {
    res.status(409).json({ error: "Für diese E-Mail-Adresse gibt es bereits ein Konto." });
    return;
  }

  const secrets = createRepository(parsed.data);

  // The PIN and WebDAV password are only ever readable here, right after
  // creation — only their hashes are stored, so this is the one chance
  // to show them to the person setting this up. A pending account doesn't
  // get signed in yet (and its WebDAV credentials won't work either) until
  // the admin approves it — see requireSession and webdav-server.ts.
  if (secrets.approvalStatus === "approved") {
    issueSession(res, secrets.id);
  }

  res.status(201).json({
    repositoryId: secrets.id,
    name: secrets.name,
    pin: secrets.pin,
    webdav: {
      username: secrets.webdavUsername,
      password: secrets.webdavPassword,
    },
    approvalStatus: secrets.approvalStatus,
  });
});

// Only the hash is stored, so a lost WebDAV password can't be recovered —
// this issues a fresh one instead (the old one stops working immediately).
// Session-protected: this is a "manage my own account" action, not part of
// the public registration flow above, so it isn't behind that rate limit.
repositoriesRouter.post("/webdav/regenerate", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  const password = regenerateWebdavPassword(repo.id);
  res.json({ username: repo.webdavUsername, password });
});

// Same idea as above, for the repository-ID + 4-digit backup code.
repositoriesRouter.post("/pin/regenerate", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  const pin = regeneratePin(repo.id);
  res.json({ repositoryId: repo.id, pin });
});

const deleteAccountSchema = z.object({ password: z.string().min(1) });

repositoriesRouter.delete("/me", requireSession, async (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }

  // The admin deleting themself would leave the instance with no one able
  // to approve new accounts — block it rather than risk that dead end.
  if (repo.isAdmin) {
    res.status(400).json({
      error:
        "Der Administrator kann sein Konto nicht selbst löschen, solange es keinen anderen Administrator gibt.",
    });
    return;
  }

  const parsed = deleteAccountSchema.safeParse(req.body ?? {});
  if (!parsed.success || !verifyPassword(repo, parsed.data.password)) {
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }

  deleteRepository(repo.id);
  await removeAllRepositoryData(repo.id).catch(() => {
    // The account is already gone from the database at this point — a
    // leftover directory on disk is a cleanup nuisance, not a reason to
    // tell the person their deletion failed.
  });
  clearSession(res);
  res.status(204).end();
});
