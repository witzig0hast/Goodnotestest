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
  process.env.OCR_DATA_DIR = join(tempDir, "ocr");
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
      body: body as unknown as BodyInit,
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

describe("tags", () => {
  it("creates tags, assigns them across folders and follows renames", async () => {
    const repo = await createRepository("Tags");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Mathe");
    await client.createDirectory("/Physik");
    await client.putFileContents("/Mathe/A.pdf", Buffer.from(await makeTestPdf("A")));
    await client.putFileContents("/Physik/B.pdf", Buffer.from(await makeTestPdf("B")));

    const tag = await (
      await api(repo.cookie, "/api/tags", { method: "POST", body: JSON.stringify({ name: "Prüfung", color: "red" }) })
    ).json();
    expect(
      (await api(repo.cookie, "/api/tags", { method: "POST", body: JSON.stringify({ name: "Prüfung", color: "blue" }) }))
        .status
    ).toBe(409);

    for (const path of ["Mathe/A.pdf", "Physik"]) {
      expect(
        (await api(repo.cookie, `/api/tags/${tag.id}/assign`, { method: "POST", body: JSON.stringify({ path }) })).status
      ).toBe(204);
    }
    expect(
      (await api(repo.cookie, `/api/tags/${tag.id}/assign`, { method: "POST", body: JSON.stringify({ path: "Gibts/nicht.pdf" }) }))
        .status
    ).toBe(400);

    await api(repo.cookie, "/api/files/rename", { method: "POST", body: JSON.stringify({ path: "Physik", newName: "Physik 1" }) });
    const { assignments } = await (await api(repo.cookie, "/api/tags")).json();
    expect(assignments).toEqual({ "Mathe/A.pdf": [tag.id], "Physik 1": [tag.id] });

    await api(repo.cookie, `/api/tags/${tag.id}/assign`, { method: "DELETE", body: JSON.stringify({ path: "Mathe/A.pdf" }) });
    await api(repo.cookie, `/api/tags/${tag.id}`, { method: "DELETE" });
    expect(await (await api(repo.cookie, "/api/tags")).json()).toEqual({ tags: [], assignments: {} });
  });

  it("can't touch another account's tags", async () => {
    const a = await createRepository("Tags A");
    const b = await createRepository("Tags B");
    await webdavClientFor(b).putFileContents("/x.pdf", Buffer.from(await makeTestPdf("x")));
    const tag = await (
      await api(a.cookie, "/api/tags", { method: "POST", body: JSON.stringify({ name: "Privat", color: "green" }) })
    ).json();
    expect(
      (await api(b.cookie, `/api/tags/${tag.id}/assign`, { method: "POST", body: JSON.stringify({ path: "x.pdf" }) })).status
    ).toBe(404);
    expect((await api(b.cookie, `/api/tags/${tag.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("page-level search and handwriting recognition", () => {
  async function makeMultiPagePdf(texts: string[]) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const t of texts) {
      const page = doc.addPage([300, 300]);
      page.drawText(t, { x: 20, y: 250, size: 14, font, color: rgb(0, 0, 0) });
    }
    return doc.save();
  }

  it("reports the page a search hit is on", async () => {
    const repo = await createRepository("Seitensuche");
    await webdavClientFor(repo).putFileContents(
      "/Skript.pdf",
      Buffer.from(await makeMultiPagePdf(["Einleitung und Motivation", "Kapitel Zwei", "Grenzwerte von Folgen"]))
    );
    const { indexFile } = await import("./lib/ocr.js");
    await indexFile(repo.repositoryId, "Skript.pdf");

    const { results } = await (await api(repo.cookie, "/api/files/search?q=grenzwerte")).json();
    expect(results).toEqual([
      expect.objectContaining({ path: "Skript.pdf", matchedIn: "content", page: 3 }),
    ]);
    const status = await (await api(repo.cookie, "/api/files/index-status")).json();
    expect(status).toMatchObject({ pdfCount: 1, indexed: 1 });
  });

  it("recognizes text on pages that are only an image", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(1240, 600);
    const g = canvas.getContext("2d");
    g.fillStyle = "white";
    g.fillRect(0, 0, 1240, 600);
    g.fillStyle = "#1a2a6c";
    g.font = "italic 64px sans-serif";
    g.fillText("Klausur am Donnerstag", 80, 200);
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(canvas.toBuffer("image/png"));
    doc.addPage([595, 288]).drawImage(img, { x: 0, y: 0, width: 595, height: 288 });

    const { extractPages } = await import("./lib/ocr.js");
    const pages = await extractPages(Buffer.from(await doc.save()), true);
    expect(pages[0].source).toBe("ocr");
    expect(pages[0].text).toContain("Klausur");
  }, 60_000);
});

describe("reading position and bookmarks", () => {
  it("remembers the last page and lists recently viewed notes", async () => {
    const repo = await createRepository("Lesen");
    const client = webdavClientFor(repo);
    await client.putFileContents("/A.pdf", Buffer.from(await makeTestPdf("A")));
    await client.putFileContents("/B.pdf", Buffer.from(await makeTestPdf("B")));
    const save = (path: string, page: number) =>
      api(repo.cookie, "/api/reading/position", { method: "POST", body: JSON.stringify({ path, page, pageCount: 10 }) });
    expect((await save("A.pdf", 4)).status).toBe(204);
    await new Promise((r) => setTimeout(r, 10));
    await save("B.pdf", 2);
    expect((await save("Gibts-nicht.pdf", 1)).status).toBe(400);

    const { items } = await (await api(repo.cookie, "/api/reading/recent")).json();
    expect(items.map((i: { path: string }) => i.path)).toEqual(["B.pdf", "A.pdf"]);
    expect(items[1]).toMatchObject({ lastPage: 4, pageCount: 10 });
    expect(await (await api(repo.cookie, "/api/reading/position?path=A.pdf")).json()).toEqual({ lastPage: 4 });

    // follows renames, disappears with deletes
    await api(repo.cookie, "/api/files/rename", { method: "POST", body: JSON.stringify({ path: "A.pdf", newName: "C.pdf" }) });
    await api(repo.cookie, "/api/files/delete", { method: "POST", body: JSON.stringify({ path: "B.pdf" }) });
    const after = await (await api(repo.cookie, "/api/reading/recent")).json();
    expect(after.items.map((i: { path: string }) => i.path)).toEqual(["C.pdf"]);
  });

  it("stores page bookmarks with notes, per account", async () => {
    const repo = await createRepository("Lesezeichen");
    const other = await createRepository("Lesezeichen 2");
    await webdavClientFor(repo).putFileContents("/Skript.pdf", Buffer.from(await makeTestPdf("x")));
    const created = await (
      await api(repo.cookie, "/api/reading/bookmarks", {
        method: "POST",
        body: JSON.stringify({ path: "Skript.pdf", page: 12, note: "Formel" }),
      })
    ).json();
    expect(created).toMatchObject({ path: "Skript.pdf", page: 12, note: "Formel" });
    expect((await api(other.cookie, `/api/reading/bookmarks/${created.id}`, { method: "DELETE" })).status).toBe(404);
    const { bookmarks } = await (await api(repo.cookie, "/api/reading/bookmarks?path=Skript.pdf")).json();
    expect(bookmarks).toHaveLength(1);
    expect((await api(repo.cookie, `/api/reading/bookmarks/${created.id}`, { method: "DELETE" })).status).toBe(204);
  });
});

describe("signed-in devices", () => {
  async function login(email: string, agent: string) {
    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": agent },
      body: JSON.stringify({ email, password: "sicheres-passwort" }),
    });
    return res.headers.get("set-cookie")!.split(";")[0];
  }

  it("lists sessions and signs other devices out", async () => {
    const repo = await createRepository("Geräte");
    const phone = await login(repo.email, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
    const laptop = await login(repo.email, "Mozilla/5.0 (Macintosh) Firefox/130.0");

    const { sessions } = await (await api(laptop, "/api/auth/sessions")).json();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(sessions.some((s: { userAgent: string }) => s.userAgent.includes("iPhone"))).toBe(true);

    const del = await (await api(laptop, "/api/auth/sessions", { method: "DELETE" })).json();
    expect(del.signedOut).toBeGreaterThanOrEqual(1);
    expect((await api(phone, "/api/auth/me")).status).toBe(401);
    expect((await api(laptop, "/api/auth/me")).status).toBe(200);
  });

  it("logging out ends only that session", async () => {
    const repo = await createRepository("Abmelden");
    const a = await login(repo.email, "A");
    const b = await login(repo.email, "B");
    await api(a, "/api/auth/logout", { method: "POST" });
    expect((await api(a, "/api/auth/me")).status).toBe(401);
    expect((await api(b, "/api/auth/me")).status).toBe(200);
  });
});

describe("two-factor sign-in", () => {
  it("matches the RFC 6238 test vector", async () => {
    const { totpCode, base32Encode } = await import("./lib/totp.js");
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1_111_111_109_000)).toBe("081804");
  });

  it("requires the authenticator code after the password once enabled", async () => {
    const { totpCode } = await import("./lib/totp.js");
    const repo = await createRepository("Zwei Faktoren");
    const setup = await (await api(repo.cookie, "/api/auth/totp/setup", { method: "POST" })).json();
    expect(setup.otpauthUrl).toContain("otpauth://totp/");

    expect(
      (await api(repo.cookie, "/api/auth/totp/enable", { method: "POST", body: JSON.stringify({ setupToken: setup.setupToken, code: "000000" }) })).status
    ).toBe(400);
    const enable = await api(repo.cookie, "/api/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ setupToken: setup.setupToken, code: totpCode(setup.secret) }),
    });
    expect(enable.status).toBe(200);
    expect((await (await api(repo.cookie, "/api/auth/me")).json()).totpEnabled).toBe(true);

    const step1 = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: repo.email, password: "sicheres-passwort" }),
    });
    expect(step1.headers.get("set-cookie")).toBeNull();
    const { totpRequired, ticket } = await step1.json();
    expect(totpRequired).toBe(true);

    const wrong = await fetch(`${baseUrl}/api/auth/login-totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, code: "123456" }),
    });
    expect(wrong.status).toBe(401);
    const right = await fetch(`${baseUrl}/api/auth/login-totp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, code: totpCode(setup.secret) }),
    });
    expect(right.status).toBe(200);
    expect(right.headers.get("set-cookie")).toContain("goodshare_session=");

    await api(repo.cookie, "/api/auth/totp/disable", { method: "POST", body: JSON.stringify({ code: totpCode(setup.secret) }) });
    expect((await (await api(repo.cookie, "/api/auth/me")).json()).totpEnabled).toBe(false);
  });
});

describe("study sheets", () => {
  async function multiPagePdf(pages: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200 + i, 200]);
    return Buffer.from(await doc.save());
  }

  it("composes pages from several notebooks into one PDF and saves it", async () => {
    const repo = await createRepository("Lernzettel");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Uni");
    await client.putFileContents("/Uni/Analysis.pdf", await multiPagePdf(5));
    await client.putFileContents("/Statistik.pdf", await multiPagePdf(3));

    const sheet = await (
      await api(repo.cookie, "/api/study-sheets", {
        method: "POST",
        body: JSON.stringify({ name: "Klausur", pages: [{ path: "Uni/Analysis.pdf", page: 4 }] }),
      })
    ).json();
    expect(sheet.pages).toHaveLength(1);

    const added = await (
      await api(repo.cookie, `/api/study-sheets/${sheet.id}/pages`, {
        method: "POST",
        body: JSON.stringify({ pages: [{ path: "Statistik.pdf", page: 2 }, { path: "Uni/Analysis.pdf", page: 1 }] }),
      })
    ).json();
    expect(added.pages.map((p: { page: number }) => p.page)).toEqual([4, 2, 1]);
    expect(
      (
        await api(repo.cookie, `/api/study-sheets/${sheet.id}/pages`, {
          method: "POST",
          body: JSON.stringify({ pages: [{ path: "Gibts-nicht.pdf", page: 1 }] }),
        })
      ).status
    ).toBe(400);

    // reorder: last first
    const order = [added.pages[2].id, added.pages[0].id, added.pages[1].id];
    await api(repo.cookie, `/api/study-sheets/${sheet.id}`, { method: "PATCH", body: JSON.stringify({ order }) });

    const pdfRes = await api(repo.cookie, `/api/study-sheets/${sheet.id}/pdf`);
    expect(pdfRes.headers.get("content-type")).toContain("application/pdf");
    const composed = await PDFDocument.load(new Uint8Array(await pdfRes.arrayBuffer()));
    // page widths encode the source page: Analysis p1 = 200, p4 = 203, Statistik p2 = 201
    expect(composed.getPages().map((p) => Math.round(p.getWidth()))).toEqual([200, 203, 201]);

    // a renamed source keeps working
    await api(repo.cookie, "/api/files/rename", { method: "POST", body: JSON.stringify({ path: "Uni", newName: "Studium" }) });
    const renamed = await (await api(repo.cookie, `/api/study-sheets/${sheet.id}`)).json();
    expect(renamed.pages[0].path).toBe("Studium/Analysis.pdf");

    const saved = await (await api(repo.cookie, `/api/study-sheets/${sheet.id}/save`, { method: "POST" })).json();
    expect(saved).toMatchObject({ path: "Lernzettel/Klausur.pdf", skipped: 0 });
    const again = await (await api(repo.cookie, `/api/study-sheets/${sheet.id}/save`, { method: "POST" })).json();
    expect(again.path).toBe("Lernzettel/Klausur (2).pdf");
  });

  it("keeps sheets private to their account", async () => {
    const a = await createRepository("Lernzettel A");
    const b = await createRepository("Lernzettel B");
    const sheet = await (
      await api(a.cookie, "/api/study-sheets", { method: "POST", body: JSON.stringify({ name: "Privat" }) })
    ).json();
    expect((await api(b.cookie, `/api/study-sheets/${sheet.id}`)).status).toBe(404);
    expect((await api(b.cookie, `/api/study-sheets/${sheet.id}/pdf`)).status).toBe(404);
    expect((await (await api(b.cookie, "/api/study-sheets")).json()).sheets).toEqual([]);
    expect((await api(b.cookie, `/api/study-sheets/${sheet.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await api(a.cookie, `/api/study-sheets/${sheet.id}`, { method: "DELETE" })).status).toBe(204);
  });
});
