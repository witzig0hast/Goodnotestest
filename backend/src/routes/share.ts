import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { signShareUnlockToken, verifyShareUnlockToken } from "../lib/auth-token.js";
import { requireSession } from "../middleware/require-session.js";
import {
  createShareLink,
  findShareLinkById,
  isShareLinkExpired,
  verifyShareLinkPassword,
} from "../lib/share-links.js";
import { resolveSafePath } from "../lib/storage.js";
import { streamDirectoryAsZip } from "../lib/zip.js";

export const shareRouter = Router();

const createSchema = z.object({
  path: z.string().trim().min(1),
  password: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

shareRouter.post("/", requireSession, (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }

  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(req.repositoryId!, parsed.data.path);
  } catch {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }

  if (!existsSync(absolutePath)) {
    res.status(404).json({ error: "Datei oder Ordner nicht gefunden." });
    return;
  }

  const link = createShareLink({
    repositoryId: req.repositoryId!,
    relativePath: parsed.data.path,
    isDirectory: statSync(absolutePath).isDirectory(),
    password: parsed.data.password ?? null,
    expiresInDays: parsed.data.expiresInDays ?? null,
  });

  res.status(201).json({ id: link.id });
});

// Everything below is intentionally public — a share link's whole point is
// that people without a GoodShare login can open it.

shareRouter.get("/:id", (req, res) => {
  const link = findShareLinkById(req.params.id);
  if (!link || isShareLinkExpired(link)) {
    res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });
    return;
  }

  res.json({
    name: path.basename(link.relativePath),
    type: link.isDirectory ? "folder" : "file",
    requiresPassword: Boolean(link.passwordHash),
  });
});

const unlockSchema = z.object({ password: z.string().min(1) });

shareRouter.post("/:id/unlock", (req, res) => {
  const link = findShareLinkById(req.params.id);
  if (!link || isShareLinkExpired(link)) {
    res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });
    return;
  }

  const parsed = unlockSchema.safeParse(req.body ?? {});
  if (!parsed.success || !verifyShareLinkPassword(link, parsed.data.password)) {
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }

  const token = signShareUnlockToken({ shareId: link.id });
  res.json({ token });
});

shareRouter.get("/:id/download", (req, res) => {
  const link = findShareLinkById(req.params.id);
  if (!link || isShareLinkExpired(link)) {
    res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });
    return;
  }

  if (link.passwordHash) {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const payload = verifyShareUnlockToken(token);
    if (!payload || payload.shareId !== link.id) {
      res.status(401).json({ error: "Bitte zuerst das Passwort eingeben." });
      return;
    }
  }

  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(link.repositoryId, link.relativePath);
  } catch {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }

  if (!existsSync(absolutePath)) {
    res.status(404).json({ error: "Datei oder Ordner nicht mehr vorhanden." });
    return;
  }

  if (link.isDirectory) {
    const folderName = path.basename(absolutePath);
    streamDirectoryAsZip(res, absolutePath, folderName, `${folderName}.zip`);
  } else {
    res.download(absolutePath, path.basename(absolutePath));
  }
});
