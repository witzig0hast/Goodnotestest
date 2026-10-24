import { Router } from "express";
import { requireSession } from "../middleware/require-session.js";
import {
  deleteFromTrash,
  emptyTrash,
  listTrash,
  restoreFromTrash,
  TrashItemNotFoundError,
} from "../lib/trash.js";
import { config } from "../lib/config.js";
import { logAudit } from "../lib/audit.js";

export const trashRouter = Router();

trashRouter.use(requireSession);

trashRouter.get("/", (req, res) => {
  res.json({ items: listTrash(req.repositoryId!), retentionDays: config.trashRetentionDays });
});

trashRouter.post("/:id/restore", async (req, res) => {
  try {
    const path = await restoreFromTrash(req.repositoryId!, req.params.id);
    logAudit(req, "trash.restore", path);
    res.json({ path });
  } catch (err) {
    if (err instanceof TrashItemNotFoundError) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Wiederherstellen ist fehlgeschlagen." });
    }
  }
});

trashRouter.delete("/:id", async (req, res) => {
  try {
    await deleteFromTrash(req.repositoryId!, req.params.id);
    logAudit(req, "trash.purge", req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TrashItemNotFoundError) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Endgültiges Löschen ist fehlgeschlagen." });
    }
  }
});

trashRouter.delete("/", async (req, res) => {
  const count = await emptyTrash(req.repositoryId!);
  logAudit(req, "trash.empty", `${count}`);
  res.json({ deleted: count });
});
