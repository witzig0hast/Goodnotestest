import { existsSync, promises as fs, statSync } from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { logAudit, logAuditFor } from "../lib/audit.js";
import { signUploadUnlockToken, verifyUploadUnlockToken } from "../lib/auth-token.js";
import { sendNotificationEmail } from "../lib/backup-check.js";
import { config, smtpConfig } from "../lib/config.js";
import { noteUpload, wouldExceedQuota } from "../lib/quota.js";
import { findRepositoryById } from "../lib/repositories.js";
import { freePath, isValidSegmentName, resolveSafePath } from "../lib/storage.js";
import {
  createUploadLink,
  deleteUploadLink,
  findUploadLinkById,
  isUploadLinkExpired,
  isUploadLinkFull,
  listUploadLinksForRepository,
  recordUploadLinkUse,
  verifyUploadLinkPassword,
  type UploadLinkRecord,
} from "../lib/upload-links.js";
import { quickShareLimiter, shareUnlockLimiter } from "../middleware/rate-limit.js";
import { requireSession } from "../middleware/require-session.js";

export const uploadLinksRouter = Router();

const MAX_FILE_MB = 50;
// Notes and what usually belongs next to them — no executables, archives
// or HTML that could be abused once someone opens the file.
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".heic", ".goodnotes", ".txt"];
const NOTIFY_INTERVAL_MS = 10 * 60 * 1000;
const lastNotified = new Map<string, number>();

function folderLabel(link: UploadLinkRecord): string {
  return link.relativePath ? path.basename(link.relativePath) : "Meine Notizen";
}

// --- Managing your own upload links (session-protected) ---

const createSchema = z.object({
  path: z.string().trim(),
  label: z.string().trim().max(120).optional(),
  password: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxFiles: z.number().int().min(1).max(1000).optional(),
  notifyOwner: z.boolean().optional(),
});

uploadLinksRouter.post("/", requireSession, (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }
  const relativePath = parsed.data.path.replace(/^\/+|\/+$/g, "");
  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(req.repositoryId!, relativePath);
  } catch {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }
  if (relativePath && (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory())) {
    res.status(404).json({ error: "Ordner nicht gefunden." });
    return;
  }

  const link = createUploadLink({
    repositoryId: req.repositoryId!,
    relativePath,
    label: parsed.data.label || null,
    password: parsed.data.password ?? null,
    expiresInDays: parsed.data.expiresInDays ?? null,
    maxFiles: parsed.data.maxFiles ?? null,
    notifyOwner: parsed.data.notifyOwner ?? true,
  });
  logAudit(req, "upload_link.create", relativePath || "Meine Notizen");
  res.status(201).json({ id: link.id });
});

uploadLinksRouter.get("/mine", requireSession, (req, res) => {
  res.json({
    links: listUploadLinksForRepository(req.repositoryId!).map((link) => ({
      id: link.id,
      relativePath: link.relativePath,
      label: link.label,
      requiresPassword: Boolean(link.passwordHash),
      expiresAt: link.expiresAt,
      expired: isUploadLinkExpired(link),
      maxFiles: link.maxFiles,
      uploadCount: link.uploadCount,
      full: isUploadLinkFull(link),
      createdAt: link.createdAt,
    })),
  });
});

uploadLinksRouter.delete("/:id", requireSession, (req, res) => {
  if (!deleteUploadLink(req.repositoryId!, req.params.id)) {
    res.status(404).json({ error: "Link nicht gefunden." });
    return;
  }
  logAudit(req, "upload_link.revoke", req.params.id);
  res.status(204).end();
});

// --- Public: everything below works without a GoodShare login ---

function usableLink(id: string, res: express.Response): UploadLinkRecord | null {
  const link = findUploadLinkById(id);
  const owner = link && findRepositoryById(link.repositoryId);
  if (!link || !owner || owner.approvalStatus !== "approved" || isUploadLinkExpired(link)) {
    res.status(404).json({ error: "Dieser Upload-Link ist ungültig oder abgelaufen." });
    return null;
  }
  return link;
}

uploadLinksRouter.get("/:id", (req, res) => {
  const link = usableLink(req.params.id, res);
  if (!link) return;
  const owner = findRepositoryById(link.repositoryId)!;
  res.json({
    label: link.label,
    ownerName: owner.name,
    folderName: folderLabel(link),
    requiresPassword: Boolean(link.passwordHash),
    filesLeft: link.maxFiles === null ? null : Math.max(0, link.maxFiles - link.uploadCount),
    maxFileMb: MAX_FILE_MB,
    allowedExtensions: ALLOWED_EXTENSIONS,
  });
});

uploadLinksRouter.post("/:id/unlock", shareUnlockLimiter, (req, res) => {
  const link = usableLink(req.params.id, res);
  if (!link) return;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || !verifyUploadLinkPassword(link, password)) {
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }
  res.json({ token: signUploadUnlockToken({ uploadLinkId: link.id }) });
});

function notifyOwner(link: UploadLinkRecord, fileName: string): void {
  if (!link.notifyOwner || !smtpConfig) return;
  const now = Date.now();
  if (now - (lastNotified.get(link.id) ?? 0) < NOTIFY_INTERVAL_MS) return;
  const owner = findRepositoryById(link.repositoryId);
  if (!owner?.email) return;
  lastNotified.set(link.id, now);
  sendNotificationEmail(
    owner.email,
    `GoodShare: Neue Datei in „${folderLabel(link)}“`,
    `Über deinen Upload-Link${link.label ? ` „${link.label}“` : ""} ist gerade „${fileName}“ in „${folderLabel(link)}“ angekommen.\n\n` +
      `Ansehen: ${config.frontendOrigin}/dashboard${link.relativePath ? `?path=${encodeURIComponent(link.relativePath)}` : ""}\n\n` +
      `Weitere Uploads über diesen Link meldet GoodShare frühestens in 10 Minuten wieder.`
  ).catch(() => {});
}

uploadLinksRouter.post(
  "/:id/files",
  quickShareLimiter,
  express.raw({ type: () => true, limit: `${MAX_FILE_MB}mb` }),
  async (req, res) => {
    const link = usableLink(req.params.id, res);
    if (!link) return;

    if (link.passwordHash) {
      const token = String(req.query.token ?? "");
      if (verifyUploadUnlockToken(token)?.uploadLinkId !== link.id) {
        res.status(401).json({ error: "Bitte zuerst das Passwort eingeben." });
        return;
      }
    }
    if (isUploadLinkFull(link)) {
      res.status(409).json({ error: "Über diesen Link wurden schon alle erlaubten Dateien hochgeladen." });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Keine Datei übertragen." });
      return;
    }

    let name = "";
    try {
      name = decodeURIComponent(String(req.header("X-Filename") ?? "")).trim();
    } catch {
      name = "";
    }
    if (!name || !isValidSegmentName(name) || name.startsWith(".")) {
      res.status(400).json({ error: "Ungültiger Dateiname." });
      return;
    }
    if (!ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase())) {
      res.status(415).json({
        error: `Dieser Dateityp ist nicht erlaubt. Erlaubt sind: ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (await wouldExceedQuota(link.repositoryId, req.body.length)) {
      res.status(507).json({ error: "Der Speicherplatz der empfangenden Person ist voll." });
      return;
    }

    const folderAbsolute = resolveSafePath(link.repositoryId, link.relativePath);
    if (!existsSync(folderAbsolute)) {
      res.status(404).json({ error: "Der Zielordner existiert nicht mehr." });
      return;
    }

    const relativePath = await freePath(link.repositoryId, link.relativePath, name);
    await fs.writeFile(resolveSafePath(link.repositoryId, relativePath), req.body);
    noteUpload(link.repositoryId, req.body.length);
    recordUploadLinkUse(link.id);
    logAuditFor(link.repositoryId, "upload_link.upload", relativePath, req.ip ?? null);
    notifyOwner(link, path.basename(relativePath));

    res.status(201).json({ name: path.basename(relativePath) });
  }
);
