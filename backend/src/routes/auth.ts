import { Router } from "express";
import { serialize } from "cookie";
import { z } from "zod";
import { SESSION_COOKIE_NAME, signSessionToken } from "../lib/auth-token.js";
import { findRepositoryById, verifyPin } from "../lib/repositories.js";
import { requireSession } from "../middleware/require-session.js";

export const authRouter = Router();

const loginSchema = z.object({
  repositoryId: z.string().trim().min(1),
  pin: z.string().trim().length(4),
});

const isProduction = process.env.NODE_ENV === "production";

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Bitte Repository-ID und PIN angeben." });
    return;
  }

  const { repositoryId, pin } = parsed.data;
  const repo = findRepositoryById(repositoryId);

  // Same error for "not found" and "wrong PIN" so we don't leak which
  // repository IDs exist.
  if (!repo || !verifyPin(repo, pin)) {
    res.status(401).json({ error: "Repository-ID oder PIN ist falsch." });
    return;
  }

  const token = signSessionToken({ repositoryId: repo.id });
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    })
  );

  res.json({ repositoryId: repo.id, name: repo.name });
});

authRouter.post("/logout", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
  );
  res.status(204).end();
});

authRouter.get("/me", requireSession, (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }
  res.json({ repositoryId: repo.id, name: repo.name });
});
