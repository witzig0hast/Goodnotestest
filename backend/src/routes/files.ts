import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { buildRepositoryTree, flattenFiles } from "../lib/file-tree.js";
import { addFavorite, listFavorites, removeFavorite } from "../lib/favorites.js";
import {
  deleteEntry,
  InvalidPathError,
  NotFoundError,
  renameEntry,
} from "../lib/file-management.js";
import { mergeFolderToPdf } from "../lib/merge-pdf.js";
import { requireSession } from "../middleware/require-session.js";
import { searchRepository } from "../lib/search.js";
import { resolveSafePath } from "../lib/storage.js";
import { getThumbnailPath } from "../lib/thumbnails.js";
import { listVersions, restoreVersion, versionDownloadPath } from "../lib/versions.js";
import { streamDirectoryAsZip, streamPathsAsZip } from "../lib/zip.js";

export const filesRouter = Router();

filesRouter.use(requireSession);

filesRouter.get("/tree", async (req, res) => {
  const tree = await buildRepositoryTree(req.repositoryId!);
  res.json({ tree });
});

filesRouter.get("/stats", async (req, res) => {
  const tree = await buildRepositoryTree(req.repositoryId!);
  const files = flattenFiles(tree);

  const totalSize = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const lastBackupAt = files.reduce<string | null>((latest, f) => {
    if (!f.modifiedAt) return latest;
    return !latest || f.modifiedAt > latest ? f.modifiedAt : latest;
  }, null);

  res.json({ totalFiles: files.length, totalSize, lastBackupAt });
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

filesRouter.get("/download-zip-multi", (req, res) => {
  const rawPaths = req.query.paths;
  const relativePaths = (Array.isArray(rawPaths) ? rawPaths : rawPaths ? [rawPaths] : []).map(
    String
  );

  if (relativePaths.length === 0) {
    res.status(400).json({ error: "Keine Dateien ausgewählt." });
    return;
  }

  const entries: { absolutePath: string; relativePath: string }[] = [];
  for (const relativePath of relativePaths) {
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
    entries.push({ absolutePath, relativePath });
  }

  streamPathsAsZip(res, entries, "Auswahl.zip");
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

filesRouter.get("/thumbnail", async (req, res) => {
  const relativePath = String(req.query.path ?? "");
  const thumbPath = await getThumbnailPath(req.repositoryId!, relativePath).catch(() => null);

  if (!thumbPath) {
    res.status(404).end();
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(thumbPath);
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

const deleteEntrySchema = z.object({ path: z.string().trim().min(1) });

filesRouter.post("/delete", async (req, res) => {
  const parsed = deleteEntrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Kein Pfad angegeben." });
    return;
  }

  try {
    await deleteEntry(req.repositoryId!, parsed.data.path);
    res.status(204).end();
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof InvalidPathError) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Löschen ist fehlgeschlagen." });
    }
  }
});

filesRouter.get("/versions", async (req, res) => {
  const relativePath = String(req.query.path ?? "");
  if (!relativePath) {
    res.status(400).json({ error: "Kein Pfad angegeben." });
    return;
  }
  const versions = await listVersions(req.repositoryId!, relativePath);
  res.json({ versions });
});

filesRouter.get("/versions/download", (req, res) => {
  const relativePath = String(req.query.path ?? "");
  const timestamp = String(req.query.timestamp ?? "");

  let absolutePath: string;
  try {
    absolutePath = versionDownloadPath(req.repositoryId!, relativePath, timestamp);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Nicht gefunden." });
    return;
  }

  res.download(absolutePath, path.basename(relativePath));
});

const restoreVersionSchema = z.object({
  path: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
});

filesRouter.post("/versions/restore", async (req, res) => {
  const parsed = restoreVersionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte Pfad und Version angeben." });
    return;
  }

  try {
    await restoreVersion(req.repositoryId!, parsed.data.path, parsed.data.timestamp);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Fehlgeschlagen." });
  }
});

const renameEntrySchema = z.object({
  path: z.string().trim().min(1),
  newName: z.string().trim().min(1).max(255),
});

filesRouter.post("/rename", async (req, res) => {
  const parsed = renameEntrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte Pfad und neuen Namen angeben." });
    return;
  }

  try {
    const newPath = await renameEntry(req.repositoryId!, parsed.data.path, parsed.data.newName);
    res.json({ path: newPath });
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof InvalidPathError) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Umbenennen ist fehlgeschlagen." });
    }
  }
});
