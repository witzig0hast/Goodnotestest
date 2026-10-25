import { Router } from "express";
import { z } from "zod";
import {
  clearSession,
  issueSession,
  SESSION_COOKIE_NAME,
  signTotpLoginTicket,
  signTotpSetupToken,
  verifySessionToken,
  verifyTotpLoginTicket,
  verifyTotpSetupToken,
} from "../lib/auth-token.js";
import { parse } from "cookie";
import { deleteOtherSessions, deleteSession, listSessions } from "../lib/sessions.js";
import {
  disableTotp,
  enableTotp,
  generateTotpSecret,
  getTotpSecret,
  isTotpEnabled,
  otpauthUrl,
  verifyTotp,
} from "../lib/totp.js";
import {
  findRepositoryByEmail,
  findRepositoryById,
  toSessionJson,
  verifyPassword,
  verifyPin,
  type RepositoryRecord,
} from "../lib/repositories.js";
import { requireSession } from "../middleware/require-session.js";
import { loginLimiter, pinLoginLimiter } from "../middleware/rate-limit.js";
import { logAudit } from "../lib/audit.js";

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
authRouter.post("/login", pinLoginLimiter, (req, res) => {
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
    if (repo) logAudit(req, "login.failed", "Notfall-Code", repo.id);
    res.status(401).json({ error: "Repository-ID oder Code ist falsch." });
    return;
  }

  const approvalError = approvalErrorFor(repo);
  if (approvalError) {
    res.status(403).json({ error: approvalError });
    return;
  }

  issueSession(res, repo.id, req, "code");
  logAudit(req, "login.code", null, repo.id);
  res.json(toSessionJson(repo));
});

const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post("/login-password", loginLimiter, (req, res) => {
  const parsed = passwordLoginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte E-Mail und Passwort angeben." });
    return;
  }

  const repo = findRepositoryByEmail(parsed.data.email);

  // Same error whether the email is unknown or the password is wrong.
  if (!repo || !verifyPassword(repo, parsed.data.password)) {
    if (repo) logAudit(req, "login.failed", "Passwort", repo.id);
    res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
    return;
  }

  const approvalError = approvalErrorFor(repo);
  if (approvalError) {
    res.status(403).json({ error: approvalError });
    return;
  }

  if (isTotpEnabled(repo.id)) {
    // Password was right; the session is only issued after the code step.
    res.json({ totpRequired: true, ticket: signTotpLoginTicket(repo.id) });
    return;
  }

  issueSession(res, repo.id, req, "password");
  logAudit(req, "login.password", null, repo.id);
  res.json(toSessionJson(repo));
});

const totpLoginSchema = z.object({ ticket: z.string().min(1), code: z.string().trim().min(6).max(8) });

authRouter.post("/login-totp", loginLimiter, (req, res) => {
  const parsed = totpLoginSchema.safeParse(req.body ?? {});
  const repositoryId = parsed.success ? verifyTotpLoginTicket(parsed.data.ticket) : null;
  if (!parsed.success || !repositoryId) {
    res.status(401).json({ error: "Die Anmeldung ist abgelaufen. Bitte nochmal mit Passwort beginnen." });
    return;
  }
  const repo = findRepositoryById(repositoryId);
  const secret = repo ? getTotpSecret(repo.id) : null;
  if (!repo || !secret || !verifyTotp(secret, parsed.data.code)) {
    if (repo) logAudit(req, "login.failed", "Bestätigungscode", repo.id);
    res.status(401).json({ error: "Der Bestätigungscode stimmt nicht." });
    return;
  }
  issueSession(res, repo.id, req, "password+2fa");
  logAudit(req, "login.password", "mit Bestätigungscode", repo.id);
  res.json(toSessionJson(repo));
});

authRouter.post("/logout", (req, res) => {
  const payload = verifySessionToken(parse(req.headers.cookie ?? "")[SESSION_COOKIE_NAME] ?? "");
  if (payload?.sid) deleteSession(payload.repositoryId, payload.sid);
  clearSession(res);
  res.status(204).end();
});

// --- Signed-in devices ---

authRouter.get("/sessions", requireSession, (req, res) => {
  res.json({
    sessions: listSessions(req.repositoryId!).map((s) => ({ ...s, current: s.id === req.sessionId })),
  });
});

authRouter.delete("/sessions/:id", requireSession, (req, res) => {
  if (!deleteSession(req.repositoryId!, req.params.id)) {
    res.status(404).json({ error: "Sitzung nicht gefunden." });
    return;
  }
  logAudit(req, "session.revoke", null);
  res.status(204).end();
});

authRouter.delete("/sessions", requireSession, (req, res) => {
  const count = deleteOtherSessions(req.repositoryId!, req.sessionId);
  logAudit(req, "session.revoke", `${count}`);
  res.json({ signedOut: count });
});

// --- Two-factor sign-in (authenticator app codes) ---

authRouter.post("/totp/setup", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(404).json({ error: "Konto nicht gefunden." });
    return;
  }
  const secret = generateTotpSecret();
  res.json({
    secret,
    otpauthUrl: otpauthUrl(secret, repo.email ?? repo.name),
    setupToken: signTotpSetupToken(repo.id, secret),
  });
});

authRouter.post("/totp/enable", requireSession, (req, res) => {
  const setup = verifyTotpSetupToken(String(req.body?.setupToken ?? ""));
  const code = String(req.body?.code ?? "");
  if (!setup || setup.repositoryId !== req.repositoryId) {
    res.status(400).json({ error: "Die Einrichtung ist abgelaufen. Bitte nochmal starten." });
    return;
  }
  if (!verifyTotp(setup.secret, code)) {
    res.status(400).json({ error: "Der Bestätigungscode stimmt nicht." });
    return;
  }
  enableTotp(req.repositoryId!, setup.secret);
  logAudit(req, "totp.enabled");
  res.json({ enabled: true });
});

authRouter.post("/totp/disable", requireSession, (req, res) => {
  const secret = getTotpSecret(req.repositoryId!);
  if (!secret || !verifyTotp(secret, String(req.body?.code ?? ""))) {
    res.status(400).json({ error: "Der Bestätigungscode stimmt nicht." });
    return;
  }
  disableTotp(req.repositoryId!);
  logAudit(req, "totp.disabled");
  res.json({ enabled: false });
});

authRouter.get("/me", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }
  res.json(toSessionJson(repo));
});
