import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../lib/auth-token.js";

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

  req.repositoryId = payload.repositoryId;
  next();
}
