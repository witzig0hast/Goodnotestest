import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireSession } from "../middleware/require-session.js";
import { findRepositoryById, listAllRepositories, setApprovalStatus } from "../lib/repositories.js";
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from "../lib/announcements.js";
import { listAuditAll } from "../lib/audit.js";
import { config } from "../lib/config.js";
import { getWebdavStatus } from "../lib/webdav-status.js";
import { logAudit } from "../lib/audit.js";
import { getIndividualQuota, getQuotaBytes, getUsageBytes, setQuotaBytes } from "../lib/quota.js";

export const adminRouter = Router();

adminRouter.use(requireSession, requireAdmin);

adminRouter.get("/users", async (_req, res) => {
  const users = await Promise.all(
    listAllRepositories().map(async (repo) => ({
      id: repo.id,
      name: repo.name,
      email: repo.email,
      isAdmin: repo.isAdmin,
      approvalStatus: repo.approvalStatus,
      createdAt: repo.createdAt,
      usageBytes: await getUsageBytes(repo.id),
      quotaBytes: getIndividualQuota(repo.id),
      effectiveQuotaBytes: getQuotaBytes(repo.id),
      lastBackupAt: getWebdavStatus(repo.id).lastSuccessAt,
    }))
  );
  res.json({ users, defaultQuotaBytes: config.defaultQuotaBytes });
});

const quotaSchema = z.object({
  // null = back to the server default
  quotaMb: z.number().int().min(1).max(10_000_000).nullable(),
});

adminRouter.post("/users/:id/quota", (req, res) => {
  const parsed = quotaSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte ein Limit in MB angeben (oder leer lassen)." });
    return;
  }
  const repo = findRepositoryById(req.params.id);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  const bytes = parsed.data.quotaMb === null ? null : parsed.data.quotaMb * 1024 * 1024;
  setQuotaBytes(repo.id, bytes);
  logAudit(req, "admin.quota", `${repo.name}: ${parsed.data.quotaMb === null ? "Standard" : `${parsed.data.quotaMb} MB`}`, repo.id);
  res.json({ quotaBytes: bytes, effectiveQuotaBytes: getQuotaBytes(repo.id) });
});

adminRouter.post("/users/:id/approve", (req, res) => {
  const repo = findRepositoryById(req.params.id);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  setApprovalStatus(repo.id, "approved");
  logAudit(req, "admin.approve", repo.name, repo.id);
  res.json({ approvalStatus: "approved" });
});

adminRouter.post("/users/:id/reject", (req, res) => {
  const repo = findRepositoryById(req.params.id);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  if (repo.isAdmin) {
    res.status(400).json({ error: "Der Administrator kann nicht abgelehnt werden." });
    return;
  }
  setApprovalStatus(repo.id, "rejected");
  logAudit(req, "admin.reject", repo.name, repo.id);
  res.json({ approvalStatus: "rejected" });
});

const createAnnouncementSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

adminRouter.get("/announcements", (_req, res) => {
  res.json({ announcements: listAnnouncements() });
});

adminRouter.post("/announcements", (req, res) => {
  const parsed = createAnnouncementSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte einen Text angeben." });
    return;
  }
  const announcement = createAnnouncement(parsed.data.message);
  res.status(201).json(announcement);
});

adminRouter.delete("/announcements/:id", (req, res) => {
  const deleted = deleteAnnouncement(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Nachricht nicht gefunden." });
    return;
  }
  res.status(204).end();
});

adminRouter.get("/audit", (_req, res) => {
  res.json({ entries: listAuditAll() });
});
