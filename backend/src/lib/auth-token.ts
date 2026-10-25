import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { createSession, type SessionMethod } from "./sessions.js";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface SessionPayload {
  repositoryId: string;
  /** Server-side session row (see sessions.ts); absent on cookies from older versions. */
  sid?: string;
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

export function issueSession(
  res: Response,
  repositoryId: string,
  req?: Request,
  method: SessionMethod = "password"
): string {
  const sid = createSession(repositoryId, req, method);
  const token = signSessionToken({ repositoryId, sid });
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
  return sid;
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

export interface SsoFlowPayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  // Set only when this flow was started from an already-signed-in session
  // to link SSO onto an existing account, rather than to log in — the
  // callback trusts this (it's inside the signed cookie) instead of
  // re-reading the session cookie, since the callback is a cross-site
  // redirect from the identity provider.
  linkRepositoryId?: string;
}

const SSO_FLOW_COOKIE_NAME = "goodshare_sso_flow";
const SSO_FLOW_TTL_SECONDS = 10 * 60; // the whole redirect round-trip to the IdP and back

/**
 * Holds the SSO handshake's state/nonce/PKCE verifier between the
 * redirect to the identity provider and the callback — signed so it can't
 * be tampered with, short-lived since it's only needed for one round trip.
 */
export function issueSsoFlowCookie(res: Response, payload: SsoFlowPayload): void {
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: SSO_FLOW_TTL_SECONDS });
  res.setHeader(
    "Set-Cookie",
    serialize(SSO_FLOW_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/api/auth/sso",
      maxAge: SSO_FLOW_TTL_SECONDS,
    })
  );
}

export function readSsoFlowCookie(cookieHeader: string | undefined): SsoFlowPayload | null {
  const token = parse(cookieHeader ?? "")[SSO_FLOW_COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret) as SsoFlowPayload;
  } catch {
    return null;
  }
}

export function clearSsoFlowCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SSO_FLOW_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/api/auth/sso",
      maxAge: 0,
    })
  );
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

// Same idea as the share unlock token, for password-protected upload
// links — a separate payload key so one can never stand in for the other.
export interface UploadUnlockPayload {
  uploadLinkId: string;
}

export function signUploadUnlockToken(payload: UploadUnlockPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "2h" });
}

export function verifyUploadUnlockToken(token: string): UploadUnlockPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as Partial<UploadUnlockPayload>;
    return typeof payload.uploadLinkId === "string" ? { uploadLinkId: payload.uploadLinkId } : null;
  } catch {
    return null;
  }
}

// Short-lived tokens for the two-factor flow: one carries a not yet
// confirmed TOTP secret during setup, the other proves "password was
// correct" between the password step and the code step of a sign-in.
export function signTotpSetupToken(repositoryId: string, secret: string): string {
  return jwt.sign({ purpose: "totp-setup", repositoryId, secret }, config.jwtSecret, { expiresIn: "15m" });
}

export function verifyTotpSetupToken(token: string): { repositoryId: string; secret: string } | null {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { purpose?: string; repositoryId: string; secret: string };
    return p.purpose === "totp-setup" ? { repositoryId: p.repositoryId, secret: p.secret } : null;
  } catch {
    return null;
  }
}

export function signTotpLoginTicket(repositoryId: string): string {
  return jwt.sign({ purpose: "totp-login", repositoryId }, config.jwtSecret, { expiresIn: "5m" });
}

export function verifyTotpLoginTicket(token: string): string | null {
  try {
    const p = jwt.verify(token, config.jwtSecret) as { purpose?: string; repositoryId: string };
    return p.purpose === "totp-login" ? p.repositoryId : null;
  } catch {
    return null;
  }
}
