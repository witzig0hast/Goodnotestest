import { Router } from "express";
import { requireSession } from "../middleware/require-session.js";
import { listAuditForRepository } from "../lib/audit.js";
import { listBackupDays } from "../lib/backup-history.js";

export const activityRouter = Router();

activityRouter.use(requireSession);

activityRouter.get("/log", (req, res) => {
  res.json({ entries: listAuditForRepository(req.repositoryId!) });
});

activityRouter.get("/backups", (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 182, 7), 400);
  res.json({ days: listBackupDays(req.repositoryId!, days) });
});
