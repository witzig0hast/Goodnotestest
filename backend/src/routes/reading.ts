import { existsSync } from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import { resolveSafePath } from "../lib/storage.js";
import {
  addBookmark,
  deleteBookmark,
  lastPage,
  listBookmarks,
  listRecent,
  recordView,
  updateBookmark,
} from "../lib/reading.js";

export const readingRouter = Router();

readingRouter.use(requireSession);

function fileExists(repositoryId: string, relativePath: string): boolean {
  try {
    return existsSync(resolveSafePath(repositoryId, relativePath));
  } catch {
    return false;
  }
}

const positionSchema = z.object({
  path: z.string().trim().min(1),
  page: z.number().int().min(1).max(100_000),
  pageCount: z.number().int().min(1).max(100_000).optional(),
});

readingRouter.post("/position", (req, res) => {
  const parsed = positionSchema.safeParse(req.body ?? {});
  if (!parsed.success || !fileExists(req.repositoryId!, parsed.data.path)) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }
  recordView(req.repositoryId!, parsed.data.path, parsed.data.page, parsed.data.pageCount ?? null);
  res.status(204).end();
});

readingRouter.get("/position", (req, res) => {
  res.json({ lastPage: lastPage(req.repositoryId!, String(req.query.path ?? "")) });
});

readingRouter.get("/recent", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 30);
  res.json({ items: listRecent(req.repositoryId!, limit) });
});

readingRouter.get("/bookmarks", (req, res) => {
  const path = typeof req.query.path === "string" && req.query.path ? req.query.path : undefined;
  res.json({ bookmarks: listBookmarks(req.repositoryId!, path) });
});

const bookmarkSchema = z.object({
  path: z.string().trim().min(1),
  page: z.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).optional(),
});

readingRouter.post("/bookmarks", (req, res) => {
  const parsed = bookmarkSchema.safeParse(req.body ?? {});
  if (!parsed.success || !fileExists(req.repositoryId!, parsed.data.path)) {
    res.status(400).json({ error: "Ungültige Angaben." });
    return;
  }
  res.status(201).json(addBookmark(req.repositoryId!, parsed.data.path, parsed.data.page, parsed.data.note || null));
});

readingRouter.patch("/bookmarks/:id", (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
  if (!updateBookmark(req.repositoryId!, req.params.id, note || null)) {
    res.status(404).json({ error: "Lesezeichen nicht gefunden." });
    return;
  }
  res.status(204).end();
});

readingRouter.delete("/bookmarks/:id", (req, res) => {
  if (!deleteBookmark(req.repositoryId!, req.params.id)) {
    res.status(404).json({ error: "Lesezeichen nicht gefunden." });
    return;
  }
  res.status(204).end();
});
