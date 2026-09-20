import { parse, serialize } from "cookie";
import { Router } from "express";
import { z } from "zod";
import { issueSession, signChallengeToken, verifyChallengeToken } from "../lib/auth-token.js";
import { findRepositoryById } from "../lib/repositories.js";
import {
  findCredentialById,
  listCredentialsForRepository,
  saveCredential,
  updateCredentialCounter,
} from "../lib/webauthn-credentials.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "../lib/webauthn.js";
import { requireSession } from "../middleware/require-session.js";

export const webauthnRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
const REG_CHALLENGE_COOKIE = "goodshare_webauthn_reg";
const LOGIN_CHALLENGE_COOKIE = "goodshare_webauthn_login";

function setChallengeCookie(res: import("express").Response, name: string, challenge: string) {
  res.setHeader(
    "Set-Cookie",
    serialize(name, signChallengeToken(challenge), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 5,
    })
  );
}

function readChallengeCookie(req: import("express").Request, name: string): string | null {
  const cookies = parse(req.headers.cookie ?? "");
  return verifyChallengeToken(cookies[name]);
}

// --- Registration: add a passkey to the currently signed-in account ---

webauthnRouter.get("/registration-options", requireSession, async (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }

  const options = await buildRegistrationOptions(repo);
  setChallengeCookie(res, REG_CHALLENGE_COOKIE, options.challenge);
  res.json(options);
});

webauthnRouter.post("/registration-verify", requireSession, async (req, res) => {
  const repo = findRepositoryById(req.repositoryId!);
  if (!repo) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }

  const expectedChallenge = readChallengeCookie(req, REG_CHALLENGE_COOKIE);
  if (!expectedChallenge) {
    res.status(400).json({ error: "Diese Anfrage ist abgelaufen. Bitte nochmal versuchen." });
    return;
  }

  try {
    const result = await verifyRegistration(req.body?.response, expectedChallenge);
    if (!result.verified || !result.registrationInfo) {
      res.status(400).json({ error: "Passkey konnte nicht bestätigt werden." });
      return;
    }

    const { credential } = result.registrationInfo;
    saveCredential({
      id: credential.id,
      repositoryId: repo.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    });

    res.status(201).json({ verified: true });
  } catch {
    res.status(400).json({ error: "Passkey konnte nicht eingerichtet werden." });
  }
});

webauthnRouter.get("/credentials", requireSession, (req, res) => {
  const count = listCredentialsForRepository(req.repositoryId!).length;
  res.json({ count });
});

// --- Login: sign in with any passkey registered for this site ---

webauthnRouter.get("/login-options", async (_req, res) => {
  const options = await buildAuthenticationOptions();
  setChallengeCookie(res, LOGIN_CHALLENGE_COOKIE, options.challenge);
  res.json(options);
});

const loginVerifySchema = z.object({ response: z.any() });

webauthnRouter.post("/login-verify", async (req, res) => {
  const parsed = loginVerifySchema.safeParse(req.body ?? {});
  const expectedChallenge = readChallengeCookie(req, LOGIN_CHALLENGE_COOKIE);

  if (!parsed.success || !expectedChallenge) {
    res.status(400).json({ error: "Diese Anfrage ist abgelaufen. Bitte nochmal versuchen." });
    return;
  }

  const credentialId: string | undefined = parsed.data.response?.id;
  const stored = credentialId ? findCredentialById(credentialId) : undefined;
  if (!stored) {
    res.status(401).json({ error: "Dieser Passkey ist hier nicht registriert." });
    return;
  }

  const repo = findRepositoryById(stored.repositoryId);
  if (!repo) {
    res.status(401).json({ error: "Zugehöriges Konto wurde nicht gefunden." });
    return;
  }

  try {
    const result = await verifyAuthentication(parsed.data.response, expectedChallenge, stored);
    if (!result.verified) {
      res.status(401).json({ error: "Passkey-Anmeldung fehlgeschlagen." });
      return;
    }

    updateCredentialCounter(stored.id, result.authenticationInfo.newCounter);
    issueSession(res, repo.id);
    res.json({ repositoryId: repo.id, name: repo.name, email: repo.email });
  } catch {
    res.status(401).json({ error: "Passkey-Anmeldung fehlgeschlagen." });
  }
});
