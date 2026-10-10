import { parse, serialize } from "cookie";
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
