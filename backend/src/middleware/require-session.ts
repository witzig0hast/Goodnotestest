import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { SESSION_COOKIE_NAME, issueSession, verifySessionToken } from "../lib/auth-token.js";
import { sessionExists, touchSession } from "../lib/sessions.js";
import { findRepositoryById } from "../lib/repositories.js";

declare module "express-serve-static-core" {
  interface Request {
    repositoryId?: string;
    sessionId?: string;
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

  if (payload.sid) {
    // Signed out from another device (or the session was revoked).
    if (!sessionExists(payload.sid, payload.repositoryId)) {
      res.status(401).json({ error: "Nicht angemeldet." });
      return;
    }
    touchSession(payload.sid, req.ip);
    req.sessionId = payload.sid;
  } else {
    // A cookie from before sessions were tracked: give it a session row
    // (and a fresh cookie) so it shows up in the device list too.
    req.sessionId = issueSession(res, payload.repositoryId, req, "password");
  }

  req.repositoryId = payload.repositoryId;
  next();
}
