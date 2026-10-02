import { Router } from "express";
import { z } from "zod";
import { clearSession, issueSession } from "../lib/auth-token.js";
import {
  findRepositoryByEmail,
  findRepositoryById,
  verifyPassword,
  verifyPin,
  type RepositoryRecord,
} from "../lib/repositories.js";
import { requireSession } from "../middleware/require-session.js";

export const authRouter = Router();

const PENDING_MESSAGE =
  "Deine Anfrage wird noch bearbeitet. Um Überlastung zu vermeiden, muss ein neues Konto erst von einem Menschen geprüft werden, bevor du dich anmelden kannst.";
const REJECTED_MESSAGE = "Dieses Konto wurde nicht freigeschaltet.";

function approvalErrorFor(repo: RepositoryRecord): string | null {
  if (repo.approvalStatus === "pending") return PENDING_MESSAGE;
  if (repo.approvalStatus === "rejected") return REJECTED_MESSAGE;
  return null;
}

const codeLoginSchema = z.object({
  repositoryId: z.string().trim().min(1),
  pin: z.string().trim().length(4),
});

// The original login method (repository ID + PIN), kept for repositories
// created before accounts existed and as a fallback if someone loses
// access to their email/passkey.
authRouter.post("/login", (req, res) => {
  const parsed = codeLoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte Repository-ID und Code angeben." });
    return;
  }

  const { repositoryId, pin } = parsed.data;
  const repo = findRepositoryById(repositoryId);

  // Same error for "not found" and "wrong PIN" so we don't leak which
  // repository IDs exist.
  if (!repo || !verifyPin(repo, pin)) {
    res.status(401).json({ error: "Repository-ID oder Code ist falsch." });
    return;
  }

  const approvalError = approvalErrorFor(repo);
  if (approvalError) {
    res.status(403).json({ error: approvalError });
    return;
  }

  issueSession(res, repo.id);
  res.json({ repositoryId: repo.id, name: repo.name, email: repo.email, isAdmin: repo.isAdmin });
});

const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post("/login-password", (req, res) => {
  const parsed = passwordLoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte E-Mail und Passwort angeben." });
    return;
  }

  const repo = findRepositoryByEmail(parsed.data.email);

  // Same error whether the email is unknown or the password is wrong.
  if (!repo || !verifyPassword(repo, parsed.data.password)) {
    res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
    return;
  }

  const approvalError = approvalErrorFor(repo);
  if (approvalError) {
    res.status(403).json({ error: approvalError });
    return;
  }

  issueSession(res, repo.id);
  res.json({ repositoryId: repo.id, name: repo.name, email: repo.email, isAdmin: repo.isAdmin });
});

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }
  res.json({ repositoryId: repo.id, name: repo.name, email: repo.email, isAdmin: repo.isAdmin });
});
