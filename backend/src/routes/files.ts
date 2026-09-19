import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { buildRepositoryTree } from "../lib/file-tree.js";
import { requireSession } from "../middleware/require-session.js";
import { resolveSafePath } from "../lib/storage.js";
import { streamDirectoryAsZip } from "../lib/zip.js";

export const filesRouter = Router();

filesRouter.use(requireSession);

filesRouter.get("/tree", async (req, res) => {
  const tree = await buildRepositoryTree(req.repositoryId!);
  res.json({ tree });
});

filesRouter.get("/download", (req, res) => {
  const relativePath = String(req.query.path ?? "");
  if (!relativePath) {
    res.status(400).json({ error: "Kein Pfad angegeben." });
    return;
  }

  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(req.repositoryId!, relativePath);
  } catch {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    res.status(404).json({ error: "Datei nicht gefunden." });
    return;
  }

  res.download(absolutePath, path.basename(absolutePath));
});

filesRouter.get("/download-zip", (req, res) => {
  const relativePath = String(req.query.path ?? "");

  let absolutePath: string;
  try {
    absolutePath = resolveSafePath(req.repositoryId!, relativePath);
  } catch {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }

  if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) {
    res.status(404).json({ error: "Ordner nicht gefunden." });
    return;
  }

  const folderName = relativePath ? path.basename(absolutePath) : "Meine Notizen";
  streamDirectoryAsZip(res, absolutePath, folderName, `${folderName}.zip`);
});
