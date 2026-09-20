import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { buildRepositoryTree } from "../lib/file-tree.js";
import { addFavorite, listFavorites, removeFavorite } from "../lib/favorites.js";
import { mergeFolderToPdf } from "../lib/merge-pdf.js";
import { requireSession } from "../middleware/require-session.js";
import { searchRepository } from "../lib/search.js";
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

filesRouter.get("/download-pdf", async (req, res) => {
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
  const bytes = await mergeFolderToPdf(req.repositoryId!, relativePath);
  res.setHeader("Content-Type", "application/pdf");
  res.attachment(`${folderName}.pdf`);
  res.send(Buffer.from(bytes));
});

filesRouter.get("/search", async (req, res) => {
  const query = String(req.query.q ?? "");
  const results = await searchRepository(req.repositoryId!, query);
  res.json({ results });
});

filesRouter.get("/favorites", (req, res) => {
  res.json({ paths: listFavorites(req.repositoryId!) });
});

const favoriteSchema = z.object({ path: z.string().trim().min(1) });

filesRouter.post("/favorites", (req, res) => {
  const parsed = favoriteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Kein Pfad angegeben." });
    return;
  }
  addFavorite(req.repositoryId!, parsed.data.path);
  res.status(201).end();
});

filesRouter.delete("/favorites", (req, res) => {
  const parsed = favoriteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Kein Pfad angegeben." });
    return;
  }
  removeFavorite(req.repositoryId!, parsed.data.path);
  res.status(204).end();
});
