import bcrypt from "bcryptjs";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { config } from "../lib/config.js";
import { findRepositoryByWebdavUsername } from "../lib/repositories.js";
import { createShareLink } from "../lib/share-links.js";
import { isValidSegmentName, resolveSafePath } from "../lib/storage.js";

export const shortcutsRouter = Router();

const QUICK_SHARE_FOLDER = "Direkt geteilt";
const QUICK_SHARE_LINK_DAYS = 30;

/**
 * The iOS Shortcut has no session and no browser to log in with — it
 * reuses the same WebDAV credentials GoodNotes itself already has, via
 * plain HTTP Basic Auth, so there's only one set of secrets per
 * repository to manage instead of a second one just for this.
 */
function authenticate(req: express.Request): { repositoryId: string } | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) return null;

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const repo = findRepositoryByWebdavUsername(username);
  if (!repo || !bcrypt.compareSync(password, repo.webdavPasswordHash)) return null;

  return { repositoryId: repo.id };
}

async function uniqueFileName(repositoryId: string, requestedName: string): Promise<string> {
  const ext = path.extname(requestedName);
  const base = path.basename(requestedName, ext);

  for (let attempt = 0; ; attempt++) {
    const candidateName = attempt === 0 ? requestedName : `${base} (${attempt + 1})${ext}`;
    const candidatePath = `${QUICK_SHARE_FOLDER}/${candidateName}`;
    if (!existsSync(resolveSafePath(repositoryId, candidatePath))) {
      return candidatePath;
    }
  }
}

shortcutsRouter.post(
  "/quick-share",
  express.raw({ type: () => true, limit: "50mb" }),
  async (req, res) => {
    const auth = authenticate(req);
    if (!auth) {
      res.setHeader("WWW-Authenticate", 'Basic realm="GoodShare"');
      res.status(401).json({ error: "Zugangsdaten sind falsch." });
      return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Keine Datei übertragen." });
      return;
    }

    const requestedName = String(req.header("X-Filename") ?? req.query.filename ?? "");
    const safeName =
      requestedName && isValidSegmentName(requestedName)
        ? requestedName
        : `Geteilt-${Date.now()}.pdf`;

    const relativePath = await uniqueFileName(auth.repositoryId, safeName);
    const absolutePath = resolveSafePath(auth.repositoryId, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, req.body);

    const link = createShareLink({
      repositoryId: auth.repositoryId,
      items: [{ relativePath, isDirectory: false }],
      password: null,
      expiresInDays: QUICK_SHARE_LINK_DAYS,
    });

    res.status(201).json({ url: `${config.frontendOrigin}/s/${link.id}` });
  }
);
