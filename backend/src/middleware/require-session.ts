import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../lib/auth-token.js";
import { findRepositoryById } from "../lib/repositories.js";

declare module "express-serve-static-core" {
  interface Request {
    repositoryId?: string;
  }
}

export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[SESSION_COOKIE_NAME];
  const payload = token ? verifySessionToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }

  // Re-checked on every request (not just at login) so that an admin
  // revoking approval takes effect immediately, even for an already
  // signed-in session.
  const repo = findRepositoryById(payload.repositoryId);
  if (!repo || repo.approvalStatus !== "approved") {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }

  req.repositoryId = payload.repositoryId;
  next();
}
