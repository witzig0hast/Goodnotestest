import { Router, type Request } from "express";
import {
  clearSsoFlowCookie,
  issueSession,
  issueSsoFlowCookie,
  readSsoFlowCookie,
} from "../lib/auth-token.js";
import { config, oidcConfig } from "../lib/config.js";
import { ssoLimiter } from "../middleware/rate-limit.js";
import {
  buildAuthorizationUrl,
  createPkceFlow,
  exchangeCodeForClaims,
} from "../lib/oidc.js";
import {
  createRepositoryViaSso,
  findRepositoryByEmail,
  findRepositoryBySsoSubject,
  linkSsoIdentity,
} from "../lib/repositories.js";

export const ssoRouter = Router();

const PROVIDER = "oidc";

function redirectUriFor(req: Request): string {
  return `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;
}

ssoRouter.get("/status", (_req, res) => {
  if (!oidcConfig) {
    res.json({ enabled: false });
    return;
  }
  res.json({ enabled: true, providerName: oidcConfig.providerName });
});

ssoRouter.get("/start", ssoLimiter, async (req, res) => {
  if (!oidcConfig) {
    res.status(404).json({ error: "SSO ist auf diesem Server nicht eingerichtet." });
    return;
  }
  try {
    const flow = createPkceFlow();
    const redirectUri = redirectUriFor(req);
    const authorizationUrl = await buildAuthorizationUrl(flow, redirectUri);
    issueSsoFlowCookie(res, {
      state: flow.state,
      nonce: flow.nonce,
      codeVerifier: flow.codeVerifier,
      redirectUri,
    });
    res.redirect(authorizationUrl);
  } catch {
    res.status(502).json({ error: "Der Anmeldedienst ist gerade nicht erreichbar." });
  }
});

ssoRouter.get("/callback", ssoLimiter, async (req, res) => {
  const frontendOrigin = config.frontendOrigin;
  const failUrl = (reason: string) => `${frontendOrigin}/login?sso_error=${reason}`;

  if (!oidcConfig) {
    res.redirect(failUrl("not_configured"));
    return;
  }

  const flow = readSsoFlowCookie(req.headers.cookie);
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  if (!flow || !code || !state || state !== flow.state) {
    clearSsoFlowCookie(res);
    res.redirect(failUrl("invalid_state"));
    return;
  }

  try {
    const claims = await exchangeCodeForClaims(code, flow.redirectUri, flow.codeVerifier, flow.nonce);
    clearSsoFlowCookie(res);

    let repo = findRepositoryBySsoSubject(PROVIDER, claims.sub);

    if (!repo && claims.email) {
      const existingByEmail = findRepositoryByEmail(claims.email);
      if (existingByEmail) {
        linkSsoIdentity(existingByEmail.id, PROVIDER, claims.sub);
        repo = existingByEmail;
      }
    }

    if (!repo) {
      repo = createRepositoryViaSso({
        name: claims.name ?? claims.email ?? "Mein Konto",
        email: claims.email,
        provider: PROVIDER,
        subject: claims.sub,
      });
    }

    if (repo.approvalStatus !== "approved") {
      res.redirect(failUrl("pending"));
      return;
    }

    issueSession(res, repo.id);
    res.redirect(`${frontendOrigin}/dashboard`);
  } catch {
    clearSsoFlowCookie(res);
    res.redirect(failUrl("failed"));
  }
});
