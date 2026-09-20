import { serialize } from "cookie";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface SessionPayload {
  repositoryId: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days: signing in shouldn't be a weekly chore

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "goodshare_session";

const isProduction = process.env.NODE_ENV === "production";

export function issueSession(res: Response, repositoryId: string): void {
  const token = signSessionToken({ repositoryId });
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    })
  );
}

export function clearSession(res: Response): void {
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
}

export interface ChallengePayload {
  challenge: string;
}

export function signChallengeToken(challenge: string): string {
  return jwt.sign({ challenge } as ChallengePayload, config.jwtSecret, {
    expiresIn: "5m",
  });
}

export function verifyChallengeToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    return (jwt.verify(token, config.jwtSecret) as ChallengePayload).challenge;
  } catch {
    return null;
  }
}

export interface ShareUnlockPayload {
  shareId: string;
}

export function signShareUnlockToken(payload: ShareUnlockPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "15m" });
}

export function verifyShareUnlockToken(token: string): ShareUnlockPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as ShareUnlockPayload;
  } catch {
    return null;
  }
}
