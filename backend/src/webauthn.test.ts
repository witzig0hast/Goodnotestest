import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "./app.js";

function cookiesFrom(res: { headers: Record<string, unknown> }): string[] {
  const value = res.headers["set-cookie"];
  return Array.isArray(value) ? value : value ? [value as string] : [];
}

let app: ReturnType<typeof createApp>;
let tempDir: string;

async function createAndLogin() {
  const res = await request(app)
    .post("/api/repositories")
    .send({ name: "Passkey Test", email: `${Date.now()}@example.com`, password: "sicheres-passwort" });
  const cookie = res.headers["set-cookie"]![0];
  return { repositoryId: res.body.repositoryId as string, cookie };
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-webauthn-test-"));
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";

  const module = await import("./app.js");
  app = module.createApp();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("passkey registration options", () => {
  it("requires an existing session", async () => {
    const res = await request(app).get("/api/auth/webauthn/registration-options");
    expect(res.status).toBe(401);
  });

  it("returns valid WebAuthn creation options and a challenge cookie", async () => {
    const { cookie } = await createAndLogin();
    const res = await request(app)
      .get("/api/auth/webauthn/registration-options")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.rp.id).toBe("localhost");
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.authenticatorSelection.residentKey).toBe("required");
    expect(cookiesFrom(res).some((c) => c.startsWith("goodshare_webauthn_reg="))).toBe(true);
  });

  it("rejects a bogus registration response", async () => {
    const { cookie } = await createAndLogin();
    const optionsRes = await request(app)
      .get("/api/auth/webauthn/registration-options")
      .set("Cookie", cookie);
    const challengeCookie = cookiesFrom(optionsRes).find((c) => c.startsWith("goodshare_webauthn_reg="))!;

    const verifyRes = await request(app)
      .post("/api/auth/webauthn/registration-verify")
      .set("Cookie", [cookie, challengeCookie].join("; "))
      .send({ response: { id: "not-a-real-credential" } });

    expect(verifyRes.status).toBe(400);
  });
});

describe("passkey login", () => {
  it("returns usernameless authentication options and a challenge cookie", async () => {
    const res = await request(app).get("/api/auth/webauthn/login-options");

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.rpId).toBe("localhost");
    expect(res.body.allowCredentials ?? []).toEqual([]);
    expect(cookiesFrom(res).some((c) => c.startsWith("goodshare_webauthn_login="))).toBe(true);
  });

  it("rejects a credential that was never registered", async () => {
    const optionsRes = await request(app).get("/api/auth/webauthn/login-options");
    const challengeCookie = cookiesFrom(optionsRes).find((c) => c.startsWith("goodshare_webauthn_login="))!;

    const res = await request(app)
      .post("/api/auth/webauthn/login-verify")
      .set("Cookie", challengeCookie)
      .send({ response: { id: "unknown-credential-id" } });

    expect(res.status).toBe(401);
  });
});

describe("passkey count", () => {
  it("starts at zero for a new account", async () => {
    const { cookie } = await createAndLogin();
    const res = await request(app).get("/api/auth/webauthn/credentials").set("Cookie", cookie);
    expect(res.body).toEqual({ count: 0 });
  });
});
