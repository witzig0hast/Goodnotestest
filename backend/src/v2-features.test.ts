import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { createClient } from "webdav";
import { v2 as webdavServer } from "webdav-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;
let baseUrl: string;
let tempDir: string;
let server: import("http").Server;
let emailCounter = 0;
let fakeSmtp: SMTPServer;
const receivedEmails: { to: string; subject: string; text: string }[] = [];
let adminCookie: string;

// Only the very first account on a fresh instance signs in immediately —
// every one after that is pending until the admin approves it, so this
// bootstraps that admin once and has every other createRepository() call
// approve + log itself in behind the scenes.
async function bootstrapAdmin() {
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
}

async function createRepository(name: string) {
  emailCounter += 1;
  const email = `v2-${emailCounter}@example.com`;
  const password = "sicheres-passwort";
  const res = await fetch(`${baseUrl}/api/repositories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const body = (await res.json()) as {
    repositoryId: string;
    approvalStatus: "pending" | "approved" | "rejected";
    webdav: { username: string; password: string };
  };

  let cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (body.approvalStatus === "pending") {
    await fetch(`${baseUrl}/api/admin/users/${body.repositoryId}/approve`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    const login = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
  }

  return { ...body, email, cookie: cookie! };
}

async function makeTestPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 250, size: 14, font, color: rgb(0, 0, 0) });
  return doc.save();
}

function webdavClientFor(repo: { repositoryId: string; webdav: { username: string; password: string } }) {
  return createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
    username: repo.webdav.username,
    password: repo.webdav.password,
  });
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-v2-test-"));

  fakeSmtp = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((parsed) => {
          receivedEmails.push({
            to: parsed.to && "text" in parsed.to ? parsed.to.text : "",
            subject: parsed.subject ?? "",
            text: parsed.text ?? "",
          });
          callback();
        })
        .catch(callback);
    },
  });
  const smtpPort = await new Promise<number>((resolve) => {
    fakeSmtp.listen(0, "127.0.0.1", () => resolve((fakeSmtp.server.address() as AddressInfo).port));
  });

  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.FILES_DIR = join(tempDir, "files");
  process.env.VERSIONS_DIR = join(tempDir, "versions");
  process.env.THUMBNAILS_DIR = join(tempDir, "thumbnails");
  process.env.TRASH_DIR = join(tempDir, "trash");
  process.env.OCR_ENABLED = "false";
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtpPort);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_FROM = "goodshare@example.com";

  const module = await import("./app.js");
  app = module.createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;

  await bootstrapAdmin();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise<void>((resolve) => fakeSmtp.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
});

function api(cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...init.headers },
  });
}

describe("setup status", () => {
  it("reports nothing before GoodNotes has connected", async () => {
    const repo = await createRepository("Status leer");
    const res = await api(repo.cookie, "/api/repositories/webdav/status");
    expect(await res.json()).toMatchObject({
      lastSuccessAt: null,
      lastError: null,
      fileCount: 0,
    });
  });

  it("reports a wrong WebDAV password, then a successful backup", async () => {
    const repo = await createRepository("Status");
    const wrong = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: "falsch",
    });
    await wrong.getDirectoryContents("/").catch(() => {});

    let status = await (await api(repo.cookie, "/api/repositories/webdav/status")).json();
    expect(status.lastError).toBe("wrong_password");

    const client = webdavClientFor(repo);
    await client.putFileContents("/Notiz.pdf", Buffer.from(await makeTestPdf("Hallo")));
    await client.putFileContents("/Alt.goodnotes", Buffer.from("x"));

    status = await (await api(repo.cookie, "/api/repositories/webdav/status")).json();
    expect(status.lastSuccessAt).not.toBeNull();
    expect(status.fileCount).toBe(2);
    expect(status.goodnotesFormatCount).toBe(1);
  });
});
