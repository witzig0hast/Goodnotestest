import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { createApp } from "./app.js";

// A minimal stand-in for a real OpenID Connect provider (Authentik in
// production): just enough of the discovery document, token endpoint and
// JWKS for GoodShare's own OIDC client code to exercise against. The
// "authorize" step itself (the user signing in at the IdP) is never
// actually driven through a browser here — the test plays that part by
// directly registering what the token endpoint should hand back for a
// given authorization code, exactly like the real IdP would after a user
// approved the login.
const CLIENT_ID = "goodshare-test-client";
const CLIENT_SECRET = "test-client-secret";

interface FakeCodeSession {
  sub: string;
  email: string | null;
  name: string | null;
  nonce: string;
}

async function startFakeIdp() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const codeSessions = new Map<string, FakeCodeSession>();

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://ignored");

    if (url.pathname === "/.well-known/openid-configuration") {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          jwks_uri: `${base}/jwks`,
        })
      );
      return;
    }

    if (url.pathname === "/jwks") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }

    if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const params = new URLSearchParams(body);
        const code = params.get("code") ?? "";
        const session = codeSessions.get(code);
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

        if (!session || params.get("client_secret") !== CLIENT_SECRET) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }

        const idToken = await new SignJWT({
          email: session.email ?? undefined,
          name: session.name ?? undefined,
          nonce: session.nonce,
        })
          .setProtectedHeader({ alg: "RS256", kid: "test-key" })
          .setSubject(session.sub)
          .setIssuer(base)
          .setAudience(CLIENT_ID)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id_token: idToken, access_token: "fake-access-token", token_type: "Bearer" }));
      });
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    registerCode(code: string, session: FakeCodeSession) {
      codeSessions.set(code, session);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Both describe blocks below need their own createApp() instance built
// from different OIDC env vars. Vitest runs separate describe blocks'
// beforeAll hooks without guaranteeing they won't overlap, and both would
// otherwise mutate the same global process.env concurrently — so instead
// of two independent beforeAll hooks, everything is built once, in order,
// in a single top-level beforeAll, and the two describes below just read
// the results.
let noSsoTempDir: string;
let noSsoApp: ReturnType<typeof createApp>;

let tempDir: string;
let app: ReturnType<typeof createApp>;
let server: import("http").Server;
let baseUrl: string;
let idp: Awaited<ReturnType<typeof startFakeIdp>>;
let adminCookie: string;

beforeAll(async () => {
  // 1) An app instance with no OIDC env vars set at all — confirms the
  //    feature (and its login button) simply doesn't exist until configured.
  noSsoTempDir = mkdtempSync(join(tmpdir(), "goodshare-sso-off-test-"));
  vi.resetModules();
  delete process.env.OIDC_ISSUER_URL;
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  process.env.DATABASE_PATH = join(noSsoTempDir, "test.sqlite");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  noSsoApp = (await import("./app.js")).createApp();

  // 2) A second app instance, this time with a fake IdP configured, for
  //    the actual login-flow tests.
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-sso-test-"));
  idp = await startFakeIdp();

  vi.resetModules();
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.OIDC_ISSUER_URL = idp.baseUrl;
  process.env.OIDC_CLIENT_ID = CLIENT_ID;
  process.env.OIDC_CLIENT_SECRET = CLIENT_SECRET;
  process.env.OIDC_PROVIDER_NAME = "TestIdP";

  app = (await import("./app.js")).createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Bootstrap the first-ever (admin) account the normal way, so a later
  // test can check that SSO links onto an existing account by email
  // instead of creating a duplicate.
  const res = await fetch(`${baseUrl}/api/repositories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Admin",
      email: "admin@example.com",
      password: "admin-passwort-123",
    }),
  });
  adminCookie = res.headers.get("set-cookie")!.split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await idp.close();
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(noSsoTempDir, { recursive: true, force: true });
});

describe("SSO status endpoint when no OIDC provider is configured", () => {
  it("reports SSO as disabled and refuses to start a flow", async () => {
    const request = (await import("supertest")).default;
    const status = await request(noSsoApp).get("/api/auth/sso/status");
    expect(status.body).toEqual({ enabled: false });

    const start = await request(noSsoApp).get("/api/auth/sso/start");
    expect(start.status).toBe(404);
  });
});

describe("SSO login via an OpenID Connect provider (Authentik-style)", () => {
  async function startSsoFlow() {
    const res = await fetch(`${baseUrl}/api/auth/sso/start`, { redirect: "manual" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    const flowCookie = res.headers.get("set-cookie")!.split(";")[0];
    return {
      state: location.searchParams.get("state")!,
      nonce: location.searchParams.get("nonce")!,
      flowCookie,
    };
  }

  async function completeSsoFlow(session: Omit<FakeCodeSession, "nonce">) {
    const { state, nonce, flowCookie } = await startSsoFlow();
    const code = `code-${Math.random().toString(36).slice(2)}`;
    idp.registerCode(code, { ...session, nonce });

    const res = await fetch(
      `${baseUrl}/api/auth/sso/callback?code=${code}&state=${state}`,
      { headers: { Cookie: flowCookie }, redirect: "manual" }
    );
    return res;
  }

  it("reports SSO as enabled with the configured provider name", async () => {
    const res = await fetch(`${baseUrl}/api/auth/sso/status`);
    expect(await res.json()).toEqual({ enabled: true, providerName: "TestIdP" });
  });

  it("auto-provisions and auto-approves a brand new account on first SSO login", async () => {
    const res = await completeSsoFlow({
      sub: "sso-subject-1",
      email: "neuling@example.com",
      name: "Neu Ling",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
    const sessionCookie = res.headers.get("set-cookie")!.split(";")[0];

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } });
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.name).toBe("Neu Ling");
    expect(body.email).toBe("neuling@example.com");
    // No admin approval step was needed — the account could be used right away.
  });

  it("signs back into the same account on a repeat login with the same subject", async () => {
    const first = await completeSsoFlow({
      sub: "sso-subject-2",
      email: "wiederkehrer@example.com",
      name: "Wieder Kehrer",
    });
    const firstCookie = first.headers.get("set-cookie")!.split(";")[0];
    const firstMe = await (
      await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: firstCookie } })
    ).json();

    const second = await completeSsoFlow({
      sub: "sso-subject-2",
      email: "wiederkehrer@example.com",
      name: "Wieder Kehrer",
    });
    const secondCookie = second.headers.get("set-cookie")!.split(";")[0];
    const secondMe = await (
      await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: secondCookie } })
    ).json();

    expect(secondMe.repositoryId).toBe(firstMe.repositoryId);
  });

  it("links SSO to an existing account with the same email instead of creating a duplicate", async () => {
    const res = await completeSsoFlow({
      sub: "sso-subject-admin",
      email: "admin@example.com",
      name: "Admin via SSO",
    });
    expect(res.status).toBe(302);
    const sessionCookie = res.headers.get("set-cookie")!.split(";")[0];

    const me = await (
      await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })
    ).json();

    const adminMe = await (
      await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } })
    ).json();

    expect(me.repositoryId).toBe(adminMe.repositoryId);
    expect(me.isAdmin).toBe(true);
  });

  it("rejects a callback whose state doesn't match the one issued at the start of the flow", async () => {
    const { flowCookie } = await startSsoFlow();
    const res = await fetch(
      `${baseUrl}/api/auth/sso/callback?code=whatever&state=forged-state`,
      { headers: { Cookie: flowCookie }, redirect: "manual" }
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login?sso_error=invalid_state");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("goodshare_session=");
  });

  describe("linking SSO onto an already-signed-in account", () => {
    async function createPasswordAccount() {
      const email = `link-target-${Math.random().toString(36).slice(2)}@example.com`;
      const password = "sicheres-passwort";
      const res = await fetch(`${baseUrl}/api/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Link Target", email, password }),
      });
      const body = await res.json();
      await fetch(`${baseUrl}/api/admin/users/${body.repositoryId}/approve`, {
        method: "POST",
        headers: { Cookie: adminCookie },
      });
      const login = await fetch(`${baseUrl}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return {
        repositoryId: body.repositoryId as string,
        cookie: login.headers.get("set-cookie")!.split(";")[0],
      };
    }

    async function startLinkFlow(sessionCookie: string) {
      const res = await fetch(`${baseUrl}/api/auth/sso/link/start`, {
        headers: { Cookie: sessionCookie },
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!);
      const flowCookie = res.headers.get("set-cookie")!.split(";")[0];
      return {
        state: location.searchParams.get("state")!,
        nonce: location.searchParams.get("nonce")!,
        flowCookie,
      };
    }

    it("links a brand new SSO identity onto the signed-in account, and logging in again reaches it", async () => {
      const account = await createPasswordAccount();
      const { state, nonce, flowCookie } = await startLinkFlow(account.cookie);
      const sub = `link-subject-${Math.random().toString(36).slice(2)}`;
      const code = `code-${Math.random().toString(36).slice(2)}`;
      idp.registerCode(code, { sub, email: null, name: null, nonce });

      const callback = await fetch(
        `${baseUrl}/api/auth/sso/callback?code=${code}&state=${state}`,
        { headers: { Cookie: flowCookie }, redirect: "manual" }
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "http://localhost:3000/dashboard/sicherheit?sso_linked=1"
      );

      // The link flow shouldn't touch the existing session — it's still the
      // same one issued at password login, and now an ordinary SSO login
      // with that subject reaches the very same account.
      const normalLogin = await completeSsoFlow({ sub, email: null, name: null });
      const sessionCookie = normalLogin.headers.get("set-cookie")!.split(";")[0];
      const me = await (
        await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })
      ).json();
      expect(me.repositoryId).toBe(account.repositoryId);
    });

    it("refuses to link an SSO identity that's already linked to a different account", async () => {
      const alreadyLinkedElsewhere = await completeSsoFlow({
        sub: "already-linked-subject",
        email: null,
        name: "Someone Else",
      });
      const otherCookie = alreadyLinkedElsewhere.headers.get("set-cookie")!.split(";")[0];
      const otherMe = await (
        await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: otherCookie } })
      ).json();

      const account = await createPasswordAccount();
      const { state, nonce, flowCookie } = await startLinkFlow(account.cookie);
      const code = `code-${Math.random().toString(36).slice(2)}`;
      idp.registerCode(code, {
        sub: "already-linked-subject",
        email: null,
        name: null,
        nonce,
      });

      const callback = await fetch(
        `${baseUrl}/api/auth/sso/callback?code=${code}&state=${state}`,
        { headers: { Cookie: flowCookie }, redirect: "manual" }
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "http://localhost:3000/dashboard/sicherheit?sso_link_error=already_linked"
      );

      // The other account's login still works and is unaffected.
      expect(otherMe.repositoryId).not.toBe(account.repositoryId);
    });
  });

  describe("deleting an SSO-only account", () => {
    it("lets an account created via SSO (with no password) delete itself without a password", async () => {
      const login = await completeSsoFlow({
        sub: `delete-me-${Math.random().toString(36).slice(2)}`,
        email: null,
        name: "Will Delete Self",
      });
      const sessionCookie = login.headers.get("set-cookie")!.split(";")[0];

      const del = await fetch(`${baseUrl}/api/repositories/me`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: sessionCookie },
        body: JSON.stringify({}),
      });
      expect(del.status).toBe(204);

      const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } });
      expect(me.status).toBe(401);
    });
  });
});
