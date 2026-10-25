import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import { noteUpload, wouldExceedQuota } from "../lib/quota.js";
import { freePath, isValidSegmentName, resolveSafePath } from "../lib/storage.js";
import {
  addPages,
  composeSheetPdf,
  createSheet,
  deleteSheet,
  getSheet,
  listSheets,
  removePage,
  renameSheet,
  reorderPages,
  MAX_SHEET_PAGES,
} from "../lib/study-sheets.js";

export const studySheetsRouter = Router();

studySheetsRouter.use(requireSession);

const SAVE_FOLDER = "Lernzettel";

const nameSchema = z.string().trim().min(1).max(80);
const pageSchema = z.object({
  path: z.string().trim().min(1),
  page: z.number().int().min(1).max(100_000),
});

function isPdf(repositoryId: string, relativePath: string): boolean {
  if (!relativePath.toLowerCase().endsWith(".pdf")) return false;
  try {
    return existsSync(resolveSafePath(repositoryId, relativePath));
  } catch {
    return false;
  }
}

studySheetsRouter.get("/", (req, res) => {
  res.json({ sheets: listSheets(req.repositoryId!) });
});

studySheetsRouter.post("/", (req, res) => {
  const parsed = z
    .object({ name: nameSchema, pages: z.array(pageSchema).max(MAX_SHEET_PAGES).optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte gib einen Namen ein." });
    return;
  }
  const pages = parsed.data.pages ?? [];
  if (pages.some((p) => !isPdf(req.repositoryId!, p.path))) {
    res.status(400).json({ error: "Ungültige Seite." });
    return;
  }
  const sheet = createSheet(req.repositoryId!, parsed.data.name);
  if (pages.length) addPages(req.repositoryId!, sheet.id, pages);
  res.status(201).json(getSheet(req.repositoryId!, sheet.id));
});

studySheetsRouter.get("/:id", (req, res) => {
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  res.json(sheet);
});

studySheetsRouter.patch("/:id", (req, res) => {
  const parsed = z
    .object({ name: nameSchema.optional(), order: z.array(z.string()).max(MAX_SHEET_PAGES).optional() })
    .safeParse(req.body ?? {});
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }
  if (parsed.data.name) renameSheet(req.repositoryId!, sheet.id, parsed.data.name);
  if (parsed.data.order) reorderPages(sheet.id, parsed.data.order);
  res.json(getSheet(req.repositoryId!, sheet.id));
});

studySheetsRouter.delete("/:id", (req, res) => {
  if (!deleteSheet(req.repositoryId!, req.params.id)) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  res.status(204).end();
});

studySheetsRouter.post("/:id/pages", (req, res) => {
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  const parsed = z.object({ pages: z.array(pageSchema).min(1).max(MAX_SHEET_PAGES) }).safeParse(req.body ?? {});
  if (!parsed.success || parsed.data.pages.some((p) => !isPdf(req.repositoryId!, p.path))) {
    res.status(400).json({ error: "Ungültige Seite." });
    return;
  }
  if (!addPages(req.repositoryId!, sheet.id, parsed.data.pages)) {
    res.status(400).json({ error: `Ein Lernzettel kann höchstens ${MAX_SHEET_PAGES} Seiten haben.` });
    return;
  }
  res.json(getSheet(req.repositoryId!, sheet.id));
});

studySheetsRouter.delete("/:id/pages/:pageId", (req, res) => {
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet || !removePage(sheet.id, req.params.pageId)) {
    res.status(404).json({ error: "Seite nicht gefunden." });
    return;
  }
  res.json(getSheet(req.repositoryId!, sheet.id));
});

function fileNameFor(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Lernzettel";
  return isValidSegmentName(`${cleaned}.pdf`) ? `${cleaned}.pdf` : "Lernzettel.pdf";
}

studySheetsRouter.get("/:id/pdf", async (req, res) => {
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  const { bytes } = await composeSheetPdf(req.repositoryId!, sheet);
  res.type("application/pdf");
  if (req.query.download === "1") res.attachment(fileNameFor(sheet.name));
  res.send(Buffer.from(bytes));
});

/**
 * Saves the composed PDF as a regular file under "Lernzettel/", so it can
 * be shared, favourited or downloaded like any other note.
 */
studySheetsRouter.post("/:id/save", async (req, res) => {
  const sheet = getSheet(req.repositoryId!, req.params.id);
  if (!sheet) {
    res.status(404).json({ error: "Lernzettel nicht gefunden." });
    return;
  }
  const { bytes, skipped } = await composeSheetPdf(req.repositoryId!, sheet);
  if (sheet.pages.length - skipped === 0) {
    res.status(400).json({ error: "Der Lernzettel enthält noch keine Seiten." });
    return;
  }
  if (await wouldExceedQuota(req.repositoryId!, bytes.length)) {
    res.status(507).json({ error: "Dein Speicherplatz ist voll." });
    return;
  }
  await fs.mkdir(resolveSafePath(req.repositoryId!, SAVE_FOLDER), { recursive: true });
  const relativePath = await freePath(req.repositoryId!, SAVE_FOLDER, fileNameFor(sheet.name));
  await fs.writeFile(resolveSafePath(req.repositoryId!, relativePath), bytes);
  noteUpload(req.repositoryId!, bytes.length);
  res.status(201).json({ path: relativePath, name: path.basename(relativePath), skipped });
});
