import type { NextFunction, Request, Response } from "express";
import { findRepositoryById } from "../lib/repositories.js";

/**
 * Must run after requireSession — relies on req.repositoryId already being
 * set and already known to belong to an approved account.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo?.isAdmin) {
    res.status(403).json({ error: "Nur für Administratoren." });
    return;
  }
  next();
}
