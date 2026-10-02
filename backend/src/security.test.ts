import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { createApp } from "./app.js";

// The same publicly-known placeholders config.ts falls back to — not
// secret, since anyone can read them straight out of the repo. That's
// exactly the scenario these tests exist to catch.
const DEV_ONLY_JWT_SECRET = "dev-only-secret-change-me";
const DEV_ONLY_ENCRYPTION_KEY = "2132b2fd14c842b81a841014895dc9505a58f32c54b54b4dd1d5454ea929787f";

describe("production config safety checks", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("refuses to start in production with the default JWT secret and encryption key", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = DEV_ONLY_JWT_SECRET;
    process.env.ENCRYPTION_KEY = DEV_ONLY_ENCRYPTION_KEY;

    await expect(import("./lib/config.js")).rejects.toThrow(/insecure configuration/);
  });

  it("refuses to start in production with a JWT secret that's too short", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "too-short";
    process.env.ENCRYPTION_KEY = "b".repeat(64);

    await expect(import("./lib/config.js")).rejects.toThrow(/shorter than 32 characters/);
  });

  it("refuses to start in production with a malformed encryption key", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a".repeat(40);
    process.env.ENCRYPTION_KEY = "not-a-hex-string";

    await expect(import("./lib/config.js")).rejects.toThrow(/64-character hex string/);
  });

  it("boots fine in production once real, strong secrets are set", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a".repeat(40);
    process.env.ENCRYPTION_KEY = "b".repeat(64);

    await expect(import("./lib/config.js")).resolves.toBeDefined();
  });

  it("allows the development defaults outside production, for a smooth local setup", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_KEY;

    await expect(import("./lib/config.js")).resolves.toBeDefined();
  });
});

describe("rate limiting & security headers", () => {
  let app: ReturnType<typeof createApp>;
  let tempDir: string;
  let server: import("http").Server;
  let baseUrl: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "goodshare-security-test-"));
    process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
    process.env.FILES_DIR = join(tempDir, "files");
    process.env.JWT_SECRET = "test-secret";
    process.env.FRONTEND_ORIGIN = "http://localhost:3000";
    process.env.NODE_ENV = "test";
    // Opts this file's app instance back into rate limiting (skipped by
    // default under NODE_ENV=test — see middleware/rate-limit.ts) so the
    // limiter logic itself can be exercised, with tiny thresholds so the
    // tests don't need hundreds of requests.
    process.env.FORCE_RATE_LIMIT = "true";
    process.env.RATE_LIMIT_LOGIN_MAX = "3";
    process.env.RATE_LIMIT_PIN_LOGIN_MAX = "3";
    process.env.RATE_LIMIT_SHARE_UNLOCK_MAX = "3";
    process.env.RATE_LIMIT_REGISTRATION_MAX = "3";
    process.env.RATE_LIMIT_QUICK_SHARE_MAX = "3";

    const module = await import("./app.js");
    app = module.createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    delete process.env.FORCE_RATE_LIMIT;
    await new Promise((resolve) => server.close(resolve));
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("sets defensive security headers and hides the framework fingerprint", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("blocks further email+password login attempts once the limit is hit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
      });
      expect(res.status).toBe(401);
    }

    const blocked = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("blocks further repository-ID + PIN login attempts once the limit is hit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId: "NOSUCH", pin: "0000" }),
      });
      expect(res.status).toBe(401);
    }

    const blocked = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryId: "NOSUCH", pin: "0000" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("blocks further share-link unlock attempts once the limit is hit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/share/NOSUCHID/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      expect(res.status).toBe(404);
    }

    const blocked = await fetch(`${baseUrl}/api/share/NOSUCHID/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("blocks further account-registration attempts once the limit is hit", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rate Limit Test",
          email: `ratelimit${i}@example.com`,
          password: "sicheres-passwort",
        }),
      });
      expect(res.status).toBe(201);
    }

    const blocked = await fetch(`${baseUrl}/api/repositories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Rate Limit Test",
        email: "ratelimit-blocked@example.com",
        password: "sicheres-passwort",
      }),
    });
    expect(blocked.status).toBe(429);
  });
});
