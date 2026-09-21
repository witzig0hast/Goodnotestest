import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { signShareUnlockToken, verifyShareUnlockToken } from "../lib/auth-token.js";
import { requireSession } from "../middleware/require-session.js";
import {
  createShareLink,
  deleteShareLink,
  findShareLinkById,
  isShareLinkExpired,
  listShareLinksForRepository,
  recordShareLinkView,
  verifyShareLinkPassword,
} from "../lib/share-links.js";
import { resolveSafePath } from "../lib/storage.js";
import { streamDirectoryAsZip, streamPathsAsZip } from "../lib/zip.js";

export const shareRouter = Router();

const createSchema = z.object({
  paths: z.array(z.string().trim().min(1)).min(1).max(50),
  password: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

shareRouter.post("/", requireSession, (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }

  const items: { relativePath: string; isDirectory: boolean }[] = [];
  for (const relativePath of parsed.data.paths) {
    let absolutePath: string;
    try {
      absolutePath = resolveSafePath(req.repositoryId!, relativePath);
    } catch {
      res.status(400).json({ error: "Ungültiger Pfad." });
      return;
    }
    if (!existsSync(absolutePath)) {
      res.status(404).json({ error: `Nicht gefunden: ${relativePath}` });
      return;
    }
    items.push({ relativePath, isDirectory: statSync(absolutePath).isDirectory() });
  }

  const link = createShareLink({
    repositoryId: req.repositoryId!,
    items,
    password: parsed.data.password ?? null,
    expiresInDays: parsed.data.expiresInDays ?? null,
  });

  res.status(201).json({ id: link.id });
});

// --- Managing your own share links (session-protected) ---

shareRouter.get("/mine", requireSession, (req, res) => {
  const links = listShareLinksForRepository(req.repositoryId!);
  res.json({
    links: links.map((link) => ({
      id: link.id,
      items: link.items,
      requiresPassword: Boolean(link.passwordHash),
      expiresAt: link.expiresAt,
      expired: isShareLinkExpired(link),
      viewCount: link.viewCount,
      createdAt: link.createdAt,
    })),
  });
});

shareRouter.delete("/:id", requireSession, (req, res) => {
  const deleted = deleteShareLink(req.repositoryId!, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Link nicht gefunden." });
    return;
  }
  res.status(204).end();
});

// Everything below is intentionally public — a share link's whole point is
// that people without a GoodShare login can open it.

shareRouter.get("/:id", (req, res) => {
  const link = findShareLinkById(req.params.id);
  if (!link || isShareLinkExpired(link)) {
    res.status(404).json({ error: "Dieser Link ist ungültig oder abgelaufen." });
    return;
  }

  const items = link.items.map((item) => ({
    name: item.relativePath ? path.basename(item.relativePath) : "Meine Notizen",
    type: item.isDirectory ? ("folder" as const) : ("file" as const),
  }));

  const single = items.length === 1;
  res.json({
    name: single ? items[0].name : `${items.length} Objekte`,
    type: single ? items[0].type : "bundle",
    items,
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

  const existingEntries = link.items
    .map((item) => {
      try {
        return { item, absolutePath: resolveSafePath(link.repositoryId, item.relativePath) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null && existsSync(entry.absolutePath));

  if (existingEntries.length === 0) {
    res.status(404).json({ error: "Datei oder Ordner nicht mehr vorhanden." });
    return;
  }

  recordShareLinkView(link.id);

  if (existingEntries.length === 1 && !existingEntries[0].item.isDirectory) {
    const { absolutePath } = existingEntries[0];
    res.download(absolutePath, path.basename(absolutePath));
    return;
  }

  if (existingEntries.length === 1 && existingEntries[0].item.isDirectory) {
    const { item, absolutePath } = existingEntries[0];
    const folderName = item.relativePath ? path.basename(absolutePath) : "Meine Notizen";
    streamDirectoryAsZip(res, absolutePath, folderName, `${folderName}.zip`);
    return;
  }

  streamPathsAsZip(
    res,
    existingEntries.map(({ item, absolutePath }) => ({
      absolutePath,
      relativePath: item.relativePath,
    })),
    "Freigabe.zip"
  );
});
