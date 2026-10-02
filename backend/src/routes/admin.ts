import { Router } from "express";
import { requireAdmin } from "../middleware/require-admin.js";
import { requireSession } from "../middleware/require-session.js";
import { findRepositoryById, listAllRepositories, setApprovalStatus } from "../lib/repositories.js";

export const adminRouter = Router();

adminRouter.use(requireSession, requireAdmin);

adminRouter.get("/users", (_req, res) => {
  const users = listAllRepositories().map((repo) => ({
    id: repo.id,
    name: repo.name,
    email: repo.email,
    isAdmin: repo.isAdmin,
    approvalStatus: repo.approvalStatus,
    createdAt: repo.createdAt,
  }));
  res.json({ users });
});

adminRouter.post("/users/:id/approve", (req, res) => {
  const repo = findRepositoryById(req.params.id);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  setApprovalStatus(repo.id, "approved");
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
  res.json({ approvalStatus: "rejected" });
});
