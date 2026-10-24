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

describe("trash", () => {
  it("moves web deletions to the trash and restores them", async () => {
    const repo = await createRepository("Papierkorb");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Ordner");
    await client.putFileContents("/Ordner/Notiz.pdf", Buffer.from(await makeTestPdf("Eins")));

    const del = await api(repo.cookie, "/api/files/delete", {
      method: "POST",
      body: JSON.stringify({ path: "Ordner/Notiz.pdf" }),
    });
    expect(del.status).toBe(204);
    expect(await client.exists("/Ordner/Notiz.pdf")).toBe(false);

    const { items } = await (await api(repo.cookie, "/api/trash")).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ originalPath: "Ordner/Notiz.pdf", deletedBy: "web", isDirectory: false });

    const restore = await api(repo.cookie, `/api/trash/${items[0].id}/restore`, { method: "POST" });
    expect(await restore.json()).toEqual({ path: "Ordner/Notiz.pdf" });
    expect(await client.exists("/Ordner/Notiz.pdf")).toBe(true);
    expect((await (await api(repo.cookie, "/api/trash")).json()).items).toHaveLength(0);
  });

  it("restores next to an existing file instead of overwriting it", async () => {
    const repo = await createRepository("Papierkorb Konflikt");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Notiz.pdf", Buffer.from(await makeTestPdf("Alt")));
    await api(repo.cookie, "/api/files/delete", { method: "POST", body: JSON.stringify({ path: "Notiz.pdf" }) });
    await client.putFileContents("/Notiz.pdf", Buffer.from(await makeTestPdf("Neu")));

    const { items } = await (await api(repo.cookie, "/api/trash")).json();
    const restore = await api(repo.cookie, `/api/trash/${items[0].id}/restore`, { method: "POST" });
    expect(await restore.json()).toEqual({ path: "Notiz (wiederhergestellt).pdf" });
    expect(await client.exists("/Notiz.pdf")).toBe(true);
  });

  it("catches deletions GoodNotes makes over WebDAV, including whole folders", async () => {
    const repo = await createRepository("Papierkorb WebDAV");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Fach");
    await client.putFileContents("/Fach/A.pdf", Buffer.from(await makeTestPdf("A")));
    await client.putFileContents("/Fach/B.pdf", Buffer.from(await makeTestPdf("B")));
    await client.deleteFile("/Fach");

    expect(await client.exists("/Fach")).toBe(false);
    const { items } = await (await api(repo.cookie, "/api/trash")).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ originalPath: "Fach", isDirectory: true, deletedBy: "goodnotes" });

    await api(repo.cookie, `/api/trash/${items[0].id}/restore`, { method: "POST" });
    expect(await client.exists("/Fach/B.pdf")).toBe(true);
  });

  it("treats a MOVE onto an existing file as an overwrite, not a deletion", async () => {
    const repo = await createRepository("Papierkorb Move");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Notiz.pdf", Buffer.from(await makeTestPdf("Alt")));
    await client.putFileContents("/tmp-upload.pdf", Buffer.from(await makeTestPdf("Neu")));
    await client.moveFile("/tmp-upload.pdf", "/Notiz.pdf");

    expect((await (await api(repo.cookie, "/api/trash")).json()).items).toHaveLength(0);
    const versions = await (await api(repo.cookie, "/api/files/versions?path=Notiz.pdf")).json();
    expect(versions.versions.length).toBeGreaterThan(0);
  });

  it("purges single items and empties the whole trash", async () => {
    const repo = await createRepository("Papierkorb leeren");
    const client = webdavClientFor(repo);
    for (const n of ["1", "2", "3"]) {
      await client.putFileContents(`/${n}.pdf`, Buffer.from(await makeTestPdf(n)));
      await api(repo.cookie, "/api/files/delete", { method: "POST", body: JSON.stringify({ path: `${n}.pdf` }) });
    }
    const { items } = await (await api(repo.cookie, "/api/trash")).json();
    expect((await api(repo.cookie, `/api/trash/${items[0].id}`, { method: "DELETE" })).status).toBe(204);
    expect(await (await api(repo.cookie, "/api/trash", { method: "DELETE" })).json()).toEqual({ deleted: 2 });
    expect((await (await api(repo.cookie, "/api/trash")).json()).items).toHaveLength(0);
  });
});

describe("activity log", () => {
  it("records sign-ins, failed attempts and deletions for the account", async () => {
    const repo = await createRepository("Protokoll");
    await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: repo.email, password: "falsch-falsch" }),
    });
    const client = webdavClientFor(repo);
    await client.putFileContents("/Weg.pdf", Buffer.from(await makeTestPdf("x")));
    await api(repo.cookie, "/api/files/delete", { method: "POST", body: JSON.stringify({ path: "Weg.pdf" }) });

    const { entries } = await (await api(repo.cookie, "/api/activity/log")).json();
    const actions = entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["login.password", "login.failed", "file.delete"]));
    expect(entries.find((e: { action: string }) => e.action === "file.delete").detail).toBe("Weg.pdf");
  });

  it("is only visible to the account itself, and to the admin in full", async () => {
    const a = await createRepository("Protokoll A");
    const b = await createRepository("Protokoll B");
    const own = await (await api(b.cookie, "/api/activity/log")).json();
    expect(own.entries.every((e: { repositoryId: string }) => e.repositoryId === b.repositoryId)).toBe(true);

    expect((await api(a.cookie, "/api/admin/audit")).status).toBe(403);
    const all = await (await api(adminCookie, "/api/admin/audit")).json();
    const ids = new Set(all.entries.map((e: { repositoryId: string }) => e.repositoryId));
    expect(ids.has(a.repositoryId) && ids.has(b.repositoryId)).toBe(true);
  });
});

describe("backup calendar", () => {
  it("counts uploads per day", async () => {
    const repo = await createRepository("Kalender");
    const client = webdavClientFor(repo);
    await client.putFileContents("/1.pdf", Buffer.from(await makeTestPdf("1")));
    await client.putFileContents("/2.pdf", Buffer.from(await makeTestPdf("2")));
    const { days } = await (await api(repo.cookie, "/api/activity/backups")).json();
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: new Date().toISOString().slice(0, 10), uploads: 2 });
  });
});

describe("storage quota", () => {
  it("rejects WebDAV uploads beyond the account's limit and reports it", async () => {
    const repo = await createRepository("Limit");
    const set = await api(adminCookie, `/api/admin/users/${repo.repositoryId}/quota`, {
      method: "POST",
      body: JSON.stringify({ quotaMb: 1 }),
    });
    expect(set.status).toBe(200);

    const client = webdavClientFor(repo);
    await client.putFileContents("/klein.pdf", Buffer.alloc(300 * 1024, 1));
    await expect(client.putFileContents("/gross.pdf", Buffer.alloc(900 * 1024, 1))).rejects.toThrow();
    expect(await client.exists("/gross.pdf")).toBe(false);

    const status = await (await api(repo.cookie, "/api/repositories/webdav/status")).json();
    expect(status.lastError).toBe("quota_exceeded");
    const stats = await (await api(repo.cookie, "/api/files/stats")).json();
    expect(stats.quotaBytes).toBe(1024 * 1024);
  });

  it("shows usage per account to the admin, and only to the admin", async () => {
    const repo = await createRepository("Nutzung");
    await webdavClientFor(repo).putFileContents("/a.pdf", Buffer.alloc(2048, 1));
    expect((await api(repo.cookie, "/api/admin/users")).status).toBe(403);
    const { users } = await (await api(adminCookie, "/api/admin/users")).json();
    const me = users.find((u: { id: string }) => u.id === repo.repositoryId);
    expect(me.usageBytes).toBeGreaterThanOrEqual(2048);
    expect(me.quotaBytes).toBeNull();

    await api(adminCookie, `/api/admin/users/${repo.repositoryId}/quota`, {
      method: "POST",
      body: JSON.stringify({ quotaMb: 50 }),
    });
    await api(adminCookie, `/api/admin/users/${repo.repositoryId}/quota`, {
      method: "POST",
      body: JSON.stringify({ quotaMb: null }),
    });
    const after = (await (await api(adminCookie, "/api/admin/users")).json()).users.find(
      (u: { id: string }) => u.id === repo.repositoryId
    );
    expect(after.quotaBytes).toBeNull();
  });
});

describe("share links: open notification and download limit", () => {
  it("stops serving a link once its download limit is used up", async () => {
    const repo = await createRepository("Limit-Link");
    await webdavClientFor(repo).putFileContents("/Skript.pdf", Buffer.from(await makeTestPdf("x")));
    const { id } = await (
      await api(repo.cookie, "/api/share", {
        method: "POST",
        body: JSON.stringify({ paths: ["Skript.pdf"], maxDownloads: 2 }),
      })
    ).json();

    expect((await (await fetch(`${baseUrl}/api/share/${id}`)).json()).downloadsLeft).toBe(2);
    expect((await fetch(`${baseUrl}/api/share/${id}/download`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/share/${id}/download`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/share/${id}/download`)).status).toBe(410);
    expect((await fetch(`${baseUrl}/api/share/${id}`)).status).toBe(410);

    const { links } = await (await api(repo.cookie, "/api/share/mine")).json();
    expect(links[0]).toMatchObject({ maxDownloads: 2, downloadCount: 2, exhausted: true });
    const { entries } = await (await api(repo.cookie, "/api/activity/log")).json();
    expect(entries.some((e: { action: string }) => e.action === "share.limit_reached")).toBe(true);
  });

  it("emails the owner when the link is opened, at most once an hour", async () => {
    const repo = await createRepository("Benachrichtigung");
    await webdavClientFor(repo).putFileContents("/Brief.pdf", Buffer.from(await makeTestPdf("x")));
    expect((await (await api(repo.cookie, "/api/share/options")).json()).emailNotifications).toBe(true);
    const { id } = await (
      await api(repo.cookie, "/api/share", {
        method: "POST",
        body: JSON.stringify({ paths: ["Brief.pdf"], notifyOnOpen: true }),
      })
    ).json();

    const before = receivedEmails.length;
    await fetch(`${baseUrl}/api/share/${id}`);
    await fetch(`${baseUrl}/api/share/${id}`);
    await new Promise((r) => setTimeout(r, 800));
    const mails = receivedEmails.slice(before).filter((m) => m.to.includes(repo.email));
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain("Brief.pdf");
  });
});

describe("upload links", () => {
  async function uploadVia(id: string, name: string, body: Uint8Array | Buffer, token?: string) {
    return fetch(`${baseUrl}/api/upload-links/${id}/files${token ? `?token=${token}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(name) },
      body,
    });
  }

  it("lets anyone with the link drop files into the folder, without seeing it", async () => {
    const repo = await createRepository("Upload");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Uni");
    await client.putFileContents("/Uni/Geheim.pdf", Buffer.from(await makeTestPdf("x")));

    const { id } = await (
      await api(repo.cookie, "/api/upload-links", {
        method: "POST",
        body: JSON.stringify({ path: "Uni", label: "Folien Woche 3", maxFiles: 2 }),
      })
    ).json();

    const info = await (await fetch(`${baseUrl}/api/upload-links/${id}`)).json();
    expect(info).toMatchObject({ folderName: "Uni", label: "Folien Woche 3", filesLeft: 2, ownerName: "Upload" });
    expect(JSON.stringify(info)).not.toContain("Geheim");

    const pdf = await makeTestPdf("Folien");
    expect((await uploadVia(id, "Folien Ü.pdf", pdf)).status).toBe(201);
    const second = await uploadVia(id, "Folien Ü.pdf", pdf);
    expect(await second.json()).toEqual({ name: "Folien Ü (2).pdf" });
    expect((await uploadVia(id, "drei.pdf", pdf)).status).toBe(409);

    expect(await client.exists("/Uni/Folien Ü.pdf")).toBe(true);
    expect(await client.exists("/Uni/Folien Ü (2).pdf")).toBe(true);
    const { entries } = await (await api(repo.cookie, "/api/activity/log")).json();
    expect(entries.filter((e: { action: string }) => e.action === "upload_link.upload")).toHaveLength(2);
  });

  it("rejects dangerous file types and path tricks", async () => {
    const repo = await createRepository("Upload Typen");
    const { id } = await (
      await api(repo.cookie, "/api/upload-links", { method: "POST", body: JSON.stringify({ path: "" }) })
    ).json();
    expect((await uploadVia(id, "boese.html", Buffer.from("<script>"))).status).toBe(415);
    expect((await uploadVia(id, "../ausbruch.pdf", Buffer.from("x"))).status).toBe(400);
    expect((await uploadVia(id, ".versteckt.pdf", Buffer.from("x"))).status).toBe(400);
  });

  it("requires the password when the link has one, and stops working once revoked", async () => {
    const repo = await createRepository("Upload Passwort");
    const { id } = await (
      await api(repo.cookie, "/api/upload-links", {
        method: "POST",
        body: JSON.stringify({ path: "", password: "geheim" }),
      })
    ).json();
    const pdf = await makeTestPdf("x");
    expect((await uploadVia(id, "a.pdf", pdf)).status).toBe(401);

    const unlock = await fetch(`${baseUrl}/api/upload-links/${id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "geheim" }),
    });
    const { token } = await unlock.json();
    expect((await uploadVia(id, "a.pdf", pdf, token)).status).toBe(201);

    expect((await api(repo.cookie, `/api/upload-links/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${baseUrl}/api/upload-links/${id}`)).status).toBe(404);
  });

  it("respects the owner's storage limit", async () => {
    const repo = await createRepository("Upload Limit");
    await api(adminCookie, `/api/admin/users/${repo.repositoryId}/quota`, {
      method: "POST",
      body: JSON.stringify({ quotaMb: 1 }),
    });
    const { id } = await (
      await api(repo.cookie, "/api/upload-links", { method: "POST", body: JSON.stringify({ path: "" }) })
    ).json();
    expect((await uploadVia(id, "gross.pdf", Buffer.alloc(1200 * 1024, 1))).status).toBe(507);
  });
});
