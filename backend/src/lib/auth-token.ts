import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface SessionPayload {
  repositoryId: string;
}

const SESSION_TTL = "12h";

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "goodshare_session";

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
