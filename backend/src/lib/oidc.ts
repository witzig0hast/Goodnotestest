import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { oidcConfig } from "./config.js";

interface DiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let cachedDiscovery: { doc: DiscoveryDocument; fetchedAt: number } | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const DISCOVERY_CACHE_MS = 60 * 60 * 1000; // re-fetch at most once an hour

/**
 * Authentik (like any OIDC provider) publishes its endpoints at a
 * well-known URL rather than requiring them to be configured by hand —
 * fetched once and cached, since they essentially never change at runtime.
 */
async function getDiscoveryDocument(): Promise<DiscoveryDocument> {
  if (!oidcConfig) throw new Error("OIDC is not configured");
  if (cachedDiscovery && Date.now() - cachedDiscovery.fetchedAt < DISCOVERY_CACHE_MS) {
    return cachedDiscovery.doc;
  }
  const res = await fetch(`${oidcConfig.issuerUrl}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error(`OIDC discovery request failed with status ${res.status}`);
  }
  const doc = (await res.json()) as DiscoveryDocument;
  cachedDiscovery = { doc, fetchedAt: Date.now() };
  cachedJwks = null; // jwks_uri might have changed along with everything else
  return doc;
}

function getJwks(jwksUri: string) {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUri));
  }
  return cachedJwks;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export interface PkceFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
}

export function createPkceFlow(): PkceFlow {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { state, nonce, codeVerifier, codeChallenge };
}

export async function buildAuthorizationUrl(
  flow: PkceFlow,
  redirectUri: string
): Promise<string> {
  if (!oidcConfig) throw new Error("OIDC is not configured");
  const discovery = await getDiscoveryDocument();
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oidcConfig.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("code_challenge", flow.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface OidcClaims {
  sub: string;
  email: string | null;
  name: string | null;
}

/**
 * Exchanges the authorization code for tokens and verifies the id_token's
 * signature (against the provider's published JWKS), issuer, audience and
 * nonce before trusting any claim inside it.
 */
export async function exchangeCodeForClaims(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  expectedNonce: string
): Promise<OidcClaims> {
  if (!oidcConfig) throw new Error("OIDC is not configured");
  const discovery = await getDiscoveryDocument();

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`OIDC token exchange failed with status ${tokenRes.status}`);
  }
  const tokenBody = (await tokenRes.json()) as { id_token?: string };
  if (!tokenBody.id_token) {
    throw new Error("OIDC token response did not include an id_token");
  }

  const { payload } = await jwtVerify(tokenBody.id_token, getJwks(discovery.jwks_uri), {
    issuer: discovery.issuer,
    audience: oidcConfig.clientId,
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error("OIDC id_token nonce mismatch");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("OIDC id_token missing sub claim");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name:
      typeof payload.name === "string"
        ? payload.name
        : typeof payload.preferred_username === "string"
          ? payload.preferred_username
          : null,
  };
}
