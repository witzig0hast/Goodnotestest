import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;
let tempDir: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-test-"));
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";

  const module = await import("./app.js");
  app = module.createApp();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("repositories + auth", () => {
  it("creates a repository with a 4-digit PIN and WebDAV credentials", async () => {
    const res = await request(app)
      .post("/api/repositories")
      .send({ name: "Praxis Musterfrau" });

    expect(res.status).toBe(201);
    expect(res.body.repositoryId).toMatch(/^[A-Z0-9]{8}$/);
    expect(res.body.pin).toMatch(/^\d{4}$/);
    expect(res.body.webdav.username).toBeTruthy();
    expect(res.body.webdav.password).toBeTruthy();
  });

  it("defaults the name when none is given", async () => {
    const res = await request(app).post("/api/repositories").send({});
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Meine Notizen");
  });

  it("rejects login with a wrong PIN", async () => {
    const created = await request(app)
      .post("/api/repositories")
      .send({ name: "Test" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ repositoryId: created.body.repositoryId, pin: "0000" });

    expect(res.status).toBe(401);
  });

  it("rejects login for an unknown repository id", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ repositoryId: "NOSUCHID", pin: "1234" });

    expect(res.status).toBe(401);
  });

  it("logs in with the correct PIN and sets a session cookie", async () => {
    const created = await request(app)
      .post("/api/repositories")
      .send({ name: "Test Praxis" });

    const login = await request(app).post("/api/auth/login").send({
      repositoryId: created.body.repositoryId,
      pin: created.body.pin,
    });

    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"]?.[0];
    expect(cookie).toContain("goodshare_session=");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie!);
    expect(me.status).toBe(200);
    expect(me.body.repositoryId).toBe(created.body.repositoryId);
  });

  it("rejects /me without a session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session cookie", async () => {
    const created = await request(app)
      .post("/api/repositories")
      .send({ name: "Logout Test" });
    const login = await request(app).post("/api/auth/login").send({
      repositoryId: created.body.repositoryId,
      pin: created.body.pin,
    });
    const cookie = login.headers["set-cookie"]![0];

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const clearedCookie = logout.headers["set-cookie"]?.[0];
    expect(clearedCookie).toContain("goodshare_session=;");
  });
});
