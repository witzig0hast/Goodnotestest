import { existsSync } from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { requireSession } from "../middleware/require-session.js";
import { resolveSafePath } from "../lib/storage.js";
import {
  assignTag,
  createTag,
  deleteTag,
  listAssignments,
  listTags,
  TAG_COLORS,
  TagExistsError,
  unassignTag,
  updateTag,
} from "../lib/tags.js";

export const tagsRouter = Router();

tagsRouter.use(requireSession);

tagsRouter.get("/", (req, res) => {
  res.json({ tags: listTags(req.repositoryId!), assignments: listAssignments(req.repositoryId!) });
});

const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.enum(TAG_COLORS),
});

tagsRouter.post("/", (req, res) => {
  const parsed = tagSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte Name (max. 40 Zeichen) und Farbe angeben." });
    return;
  }
  try {
    res.status(201).json(createTag(req.repositoryId!, parsed.data.name, parsed.data.color));
  } catch (err) {
    if (err instanceof TagExistsError) res.status(409).json({ error: err.message });
    else throw err;
  }
});

tagsRouter.patch("/:id", (req, res) => {
  const parsed = tagSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success || !updateTag(req.repositoryId!, req.params.id, parsed.data)) {
    res.status(parsed.success ? 404 : 400).json({ error: "Tag nicht gefunden oder ungültig." });
    return;
  }
  res.status(204).end();
});

tagsRouter.delete("/:id", (req, res) => {
  if (!deleteTag(req.repositoryId!, req.params.id)) {
    res.status(404).json({ error: "Tag nicht gefunden." });
    return;
  }
  res.status(204).end();
});

const assignSchema = z.object({ path: z.string().trim().min(1) });

function validPath(repositoryId: string, relativePath: string): boolean {
  try {
    return existsSync(resolveSafePath(repositoryId, relativePath));
  } catch {
    return false;
  }
}

tagsRouter.post("/:id/assign", (req, res) => {
  const parsed = assignSchema.safeParse(req.body ?? {});
  if (!parsed.success || !validPath(req.repositoryId!, parsed.data.path)) {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }
  if (!assignTag(req.repositoryId!, req.params.id, parsed.data.path)) {
    res.status(404).json({ error: "Tag nicht gefunden." });
    return;
  }
  res.status(204).end();
});

tagsRouter.delete("/:id/assign", (req, res) => {
  const parsed = assignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültiger Pfad." });
    return;
  }
  if (!unassignTag(req.repositoryId!, req.params.id, parsed.data.path)) {
    res.status(404).json({ error: "Tag nicht gefunden." });
    return;
  }
  res.status(204).end();
});
