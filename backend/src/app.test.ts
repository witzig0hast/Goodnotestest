import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;
let tempDir: string;
let emailCounter = 0;
let adminCookie: string;
let adminRepositoryId: string;
let bootstrapResponse: request.Response;

function uniqueEmail() {
  emailCounter += 1;
  return `praxis${emailCounter}@example.com`;
}

// Every account after the very first one on an instance needs the admin's
// approval before it can log in (see the "admin bootstrap & approval
// workflow" tests below) — this helper hides that behind the scenes so the
// rest of the suite can keep assuming "create an account, get a working
// cookie back" like before.
async function createTestRepository(overrides: Partial<Record<string, unknown>> = {}) {
  const payload = {
    name: "Praxis Musterfrau",
    email: uniqueEmail(),
    password: "sicheres-passwort",
    ...overrides,
  };
  const res = await request(app).post("/api/repositories").send(payload);

  if (res.status === 201 && res.body.approvalStatus === "pending") {
    await request(app)
      .post(`/api/admin/users/${res.body.repositoryId}/approve`)
      .set("Cookie", adminCookie);
    const login = await request(app)
      .post("/api/auth/login-password")
      .send({ email: payload.email, password: payload.password });
    res.headers["set-cookie"] = login.headers["set-cookie"];
  }

  return res;
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-test-"));
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";

  const module = await import("./app.js");
  app = module.createApp();

  // The very first account ever created becomes the admin automatically —
  // bootstrap it once here so every other test can approve the accounts it
  // creates through createTestRepository above.
  bootstrapResponse = await request(app)
    .post("/api/repositories")
    .send({ name: "Admin", email: "admin@example.com", password: "admin-passwort-123" });
  adminRepositoryId = bootstrapResponse.body.repositoryId;
  adminCookie = bootstrapResponse.headers["set-cookie"][0];
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("repositories + account creation", () => {
  it("creates a repository with a short ID, a 4-digit backup code, and WebDAV credentials", async () => {
    const res = await createTestRepository();

    expect(res.status).toBe(201);
    expect(res.body.repositoryId).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.body.pin).toMatch(/^\d{4}$/);
    expect(res.body.webdav.username).toBeTruthy();
    expect(res.body.webdav.password).toBeTruthy();
  });

  it("signs the account in once approved (immediately, for the very first account on the instance)", async () => {
    const res = await createTestRepository();
    const cookie = res.headers["set-cookie"]?.[0];
    expect(cookie).toContain("goodshare_session=");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie!);
    expect(me.status).toBe(200);
    expect(me.body.repositoryId).toBe(res.body.repositoryId);
  });

  it("defaults the name when none is given", async () => {
    const res = await createTestRepository({ name: undefined });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Meine Notizen");
  });

  it("rejects a second account with the same email", async () => {
    const email = uniqueEmail();
    await createTestRepository({ email });
    const second = await createTestRepository({ email });
    expect(second.status).toBe(409);
  });

  it("rejects an invalid email or a too-short password", async () => {
    const badEmail = await createTestRepository({ email: "not-an-email" });
    expect(badEmail.status).toBe(400);

    const shortPassword = await createTestRepository({
      email: uniqueEmail(),
      password: "short",
    });
    expect(shortPassword.status).toBe(400);
  });
});

describe("email + password login", () => {
  it("logs in with the correct email and password", async () => {
    const email = uniqueEmail();
    await createTestRepository({ email, password: "korrektes-passwort" });

    const login = await request(app)
      .post("/api/auth/login-password")
      .send({ email, password: "korrektes-passwort" });

    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"]?.[0]).toContain("goodshare_session=");
  });

  it("rejects the wrong password", async () => {
    const email = uniqueEmail();
    await createTestRepository({ email, password: "korrektes-passwort" });

    const login = await request(app)
      .post("/api/auth/login-password")
      .send({ email, password: "falsches-passwort" });

    expect(login.status).toBe(401);
  });

  it("rejects an unknown email", async () => {
    const login = await request(app)
      .post("/api/auth/login-password")
      .send({ email: "nobody@example.com", password: "irgendwas" });

    expect(login.status).toBe(401);
  });
});

describe("repository ID + backup code login (fallback)", () => {
  it("rejects login with a wrong code", async () => {
    const created = await createTestRepository();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ repositoryId: created.body.repositoryId, pin: "0000" });

    expect(res.status).toBe(401);
  });

  it("rejects login for an unknown repository id", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ repositoryId: "NOSUCH", pin: "1234" });

    expect(res.status).toBe(401);
  });

  it("logs in with the correct repository ID and backup code", async () => {
    const created = await createTestRepository();

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
});

describe("session", () => {
  it("rejects /me without a session cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session cookie", async () => {
    const created = await createTestRepository();
    const cookie = created.headers["set-cookie"]![0];

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);

    const clearedCookie = logout.headers["set-cookie"]?.[0];
    expect(clearedCookie).toContain("goodshare_session=;");
  });
});

describe("admin bootstrap & approval workflow", () => {
  it("makes the very first account on the instance an admin, approved and signed in immediately", () => {
    expect(bootstrapResponse.status).toBe(201);
    expect(bootstrapResponse.body.approvalStatus).toBe("approved");
    expect(bootstrapResponse.headers["set-cookie"][0]).toContain("goodshare_session=");
  });

  it("leaves every later account pending, with no session cookie, until the admin approves it", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/repositories")
      .send({ name: "Neuling", email, password: "neues-passwort-123" });

    expect(res.status).toBe(201);
    expect(res.body.approvalStatus).toBe("pending");
    expect(res.headers["set-cookie"]).toBeUndefined();

    const loginAttempt = await request(app)
      .post("/api/auth/login-password")
      .send({ email, password: "neues-passwort-123" });
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.body.error).toMatch(/noch bearbeitet/);

    const approve = await request(app)
      .post(`/api/admin/users/${res.body.repositoryId}/approve`)
      .set("Cookie", adminCookie);
    expect(approve.status).toBe(200);

    const loginAfterApproval = await request(app)
      .post("/api/auth/login-password")
      .send({ email, password: "neues-passwort-123" });
    expect(loginAfterApproval.status).toBe(200);
    expect(loginAfterApproval.headers["set-cookie"]?.[0]).toContain("goodshare_session=");
  });

  it("blocks login for a rejected account, with a different message than pending", async () => {
    const email = uniqueEmail();
    const created = await request(app)
      .post("/api/repositories")
      .send({ name: "Abgelehnt", email, password: "noch-ein-passwort-123" });

    const reject = await request(app)
      .post(`/api/admin/users/${created.body.repositoryId}/reject`)
      .set("Cookie", adminCookie);
    expect(reject.status).toBe(200);

    const loginAttempt = await request(app)
      .post("/api/auth/login-password")
      .send({ email, password: "noch-ein-passwort-123" });
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.body.error).not.toMatch(/noch bearbeitet/);
  });

  it("refuses to let a non-admin account approve or reject anyone", async () => {
    const approvedAccount = await createTestRepository();
    const approvedCookie = approvedAccount.headers["set-cookie"]![0];

    const target = await request(app)
      .post("/api/repositories")
      .send({ name: "Noch jemand", email: uniqueEmail(), password: "irgendein-passwort-1" });

    const approveAttempt = await request(app)
      .post(`/api/admin/users/${target.body.repositoryId}/approve`)
      .set("Cookie", approvedCookie);
    expect(approveAttempt.status).toBe(403);
  });

  it("won't let the admin account be rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminRepositoryId}/reject`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("lists every account with its approval status for the admin", async () => {
    const res = await request(app).get("/api/admin/users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.find((u: { id: string }) => u.id === adminRepositoryId)?.isAdmin).toBe(
      true
    );
  });
});
