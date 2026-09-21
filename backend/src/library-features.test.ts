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

async function createRepository(name: string) {
  emailCounter += 1;
  const email = `lib${emailCounter}@example.com`;
  const res = await fetch(`${baseUrl}/api/repositories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "sicheres-passwort" }),
  });
  const body = (await res.json()) as {
    repositoryId: string;
    webdav: { username: string; password: string };
  };
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { ...body, email, cookie };
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
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-library-test-"));

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
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise<void>((resolve) => fakeSmtp.close(() => resolve()));
  rmSync(tempDir, { recursive: true, force: true });
});

describe("delete and rename", () => {
  it("deletes a file", async () => {
    const repo = await createRepository("Delete Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Weg.pdf", Buffer.from("x"));

    const res = await fetch(`${baseUrl}/api/files/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "Weg.pdf" }),
    });
    expect(res.status).toBe(204);

    const download = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Weg.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(download.status).toBe(404);
  });

  it("renames a file and it's reachable under the new name only", async () => {
    const repo = await createRepository("Rename Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Alt.pdf", Buffer.from("Inhalt"));

    const res = await fetch(`${baseUrl}/api/files/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "Alt.pdf", newName: "Neu.pdf" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "Neu.pdf" });

    const oldDownload = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Alt.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(oldDownload.status).toBe(404);

    const newDownload = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Neu.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await newDownload.text()).toBe("Inhalt");
  });

  it("rejects renaming onto an existing name", async () => {
    const repo = await createRepository("Rename Collision Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/A.pdf", Buffer.from("a"));
    await client.putFileContents("/B.pdf", Buffer.from("b"));

    const res = await fetch(`${baseUrl}/api/files/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "A.pdf", newName: "B.pdf" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("version history", () => {
  it("keeps previous versions on overwrite and can restore one", async () => {
    const repo = await createRepository("Version Test");
    const client = webdavClientFor(repo);

    await client.putFileContents("/Notiz.pdf", Buffer.from("Version 1"));
    await client.putFileContents("/Notiz.pdf", Buffer.from("Version 2"));

    const versionsRes = await fetch(
      `${baseUrl}/api/files/versions?path=${encodeURIComponent("Notiz.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    const { versions } = await versionsRes.json();
    expect(versions).toHaveLength(1);

    const versionDownload = await fetch(
      `${baseUrl}/api/files/versions/download?path=${encodeURIComponent("Notiz.pdf")}&timestamp=${versions[0].timestamp}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await versionDownload.text()).toBe("Version 1");

    const restoreRes = await fetch(`${baseUrl}/api/files/versions/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "Notiz.pdf", timestamp: versions[0].timestamp }),
    });
    expect(restoreRes.status).toBe(204);

    const current = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Notiz.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await current.text()).toBe("Version 1");
  });

  it("deleting a file also removes its version history", async () => {
    const repo = await createRepository("Version Delete Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/X.pdf", Buffer.from("v1"));
    await client.putFileContents("/X.pdf", Buffer.from("v2"));

    await fetch(`${baseUrl}/api/files/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "X.pdf" }),
    });

    const versionsRes = await fetch(
      `${baseUrl}/api/files/versions?path=${encodeURIComponent("X.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect((await versionsRes.json()).versions).toEqual([]);
  });
});

describe("stats", () => {
  it("reports total files, size, and last backup time", async () => {
    const repo = await createRepository("Stats Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/A.pdf", Buffer.from("12345"));
    await client.putFileContents("/B.pdf", Buffer.from("1234567890"));

    const res = await fetch(`${baseUrl}/api/files/stats`, { headers: { Cookie: repo.cookie } });
    const stats = await res.json();
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalSize).toBe(15);
    expect(stats.lastBackupAt).toBeTruthy();
  });
});

describe("multi-select zip download", () => {
  it("zips a chosen set of files together", async () => {
    const repo = await createRepository("Multi Zip Test");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Ordner", { recursive: true });
    await client.putFileContents("/A.pdf", Buffer.from("a"));
    await client.putFileContents("/Ordner/B.pdf", Buffer.from("b"));

    const url = `${baseUrl}/api/files/download-zip-multi?paths=${encodeURIComponent("A.pdf")}&paths=${encodeURIComponent("Ordner")}`;
    const res = await fetch(url, { headers: { Cookie: repo.cookie } });
    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("bundled share links with view counting and management", () => {
  it("creates a bundle of two files under one link and lets it be downloaded as a zip", async () => {
    const repo = await createRepository("Bundle Share Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Eins.pdf", Buffer.from("1"));
    await client.putFileContents("/Zwei.pdf", Buffer.from("2"));

    const createRes = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ paths: ["Eins.pdf", "Zwei.pdf"] }),
    });
    const { id } = await createRes.json();

    const infoRes = await fetch(`${baseUrl}/api/share/${id}`);
    const info = await infoRes.json();
    expect(info.type).toBe("bundle");
    expect(info.items).toHaveLength(2);

    const downloadRes = await fetch(`${baseUrl}/api/share/${id}/download`);
    expect(downloadRes.status).toBe(200);
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("counts views and lets the owner list and revoke their own links", async () => {
    const repo = await createRepository("Share Management Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Datei.pdf", Buffer.from("Inhalt"));

    const createRes = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ paths: ["Datei.pdf"] }),
    });
    const { id } = await createRes.json();

    await fetch(`${baseUrl}/api/share/${id}/download`);
    await fetch(`${baseUrl}/api/share/${id}/download`);

    const mineRes = await fetch(`${baseUrl}/api/share/mine`, { headers: { Cookie: repo.cookie } });
    const { links } = await mineRes.json();
    expect(links).toHaveLength(1);
    expect(links[0].viewCount).toBe(2);

    const revokeRes = await fetch(`${baseUrl}/api/share/${id}`, {
      method: "DELETE",
      headers: { Cookie: repo.cookie },
    });
    expect(revokeRes.status).toBe(204);

    const afterRevoke = await fetch(`${baseUrl}/api/share/${id}`);
    expect(afterRevoke.status).toBe(404);
  });

  it("only lets the owning account revoke a link", async () => {
    const repoA = await createRepository("Owner A");
    const repoB = await createRepository("Owner B");
    const clientA = webdavClientFor(repoA);
    await clientA.putFileContents("/Nur-A.pdf", Buffer.from("a"));

    const createRes = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repoA.cookie },
      body: JSON.stringify({ paths: ["Nur-A.pdf"] }),
    });
    const { id } = await createRes.json();

    const revokeAsB = await fetch(`${baseUrl}/api/share/${id}`, {
      method: "DELETE",
      headers: { Cookie: repoB.cookie },
    });
    expect(revokeAsB.status).toBe(404);
  });
});

describe("quick-share for the iOS Shortcut", () => {
  it("accepts a file over Basic Auth (the WebDAV credentials) and returns a working share link", async () => {
    const repo = await createRepository("Quick Share Test");
    const basicAuth = Buffer.from(`${repo.webdav.username}:${repo.webdav.password}`).toString(
      "base64"
    );

    const res = await fetch(`${baseUrl}/api/shortcuts/quick-share`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "X-Filename": "Schnell.pdf",
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from("Schnell geteilter Inhalt"),
    });
    expect(res.status).toBe(201);
    const { url } = await res.json();
    expect(url).toContain("/s/");

    const shareId = url.split("/s/")[1];
    const downloadRes = await fetch(`${baseUrl}/api/share/${shareId}/download`);
    expect(await downloadRes.text()).toBe("Schnell geteilter Inhalt");
  });

  it("rejects wrong credentials", async () => {
    await createRepository("Quick Share Wrong Creds");
    const basicAuth = Buffer.from("nichtvorhanden:falsch").toString("base64");

    const res = await fetch(`${baseUrl}/api/shortcuts/quick-share`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
      body: Buffer.from("x"),
    });
    expect(res.status).toBe(401);
  });
});

describe("scoped Nextcloud folder", () => {
  let fakeNextcloudDir: string;
  let fakeNextcloudServer: InstanceType<typeof webdavServer.WebDAVServer>;
  let fakeNextcloudHttpServer: import("http").Server;
  let fakeNextcloudUrl: string;

  beforeAll(async () => {
    fakeNextcloudDir = mkdtempSync(join(tmpdir(), "fake-nextcloud-scoped-"));
    const userManager = new webdavServer.SimpleUserManager();
    userManager.addUser("ncuser", "ncpass");
    fakeNextcloudServer = new webdavServer.WebDAVServer({
      port: 0,
      hostname: "127.0.0.1",
      requireAuthentification: true,
      httpAuthentication: new webdavServer.HTTPBasicAuthentication(userManager, "FakeNextcloud"),
      rootFileSystem: new webdavServer.PhysicalFileSystem(fakeNextcloudDir),
    });
    fakeNextcloudHttpServer = await new Promise((resolve) => {
      fakeNextcloudServer.start((s) => resolve(s!));
    });
    fakeNextcloudUrl = `http://localhost:${(fakeNextcloudHttpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fakeNextcloudServer.stop(() => resolve()));
    rmSync(fakeNextcloudDir, { recursive: true, force: true });
  });

  it("only syncs the configured subfolder, leaving other folders untouched", async () => {
    const repo = await createRepository("Scoped Sync Test");
    const client = webdavClientFor(repo);
    await client.createDirectory("/Chemie", { recursive: true });
    await client.createDirectory("/Mathe", { recursive: true });
    await client.putFileContents("/Chemie/Reaktion.pdf", Buffer.from("chemie"));
    await client.putFileContents("/Mathe/Analysis.pdf", Buffer.from("mathe"));

    await fetch(`${baseUrl}/api/nextcloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ url: fakeNextcloudUrl, username: "ncuser", password: "ncpass" }),
    });
    await fetch(`${baseUrl}/api/nextcloud/sync-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ syncPath: "Chemie" }),
    });

    const syncRes = await fetch(`${baseUrl}/api/nextcloud/sync`, {
      method: "POST",
      headers: { Cookie: repo.cookie },
    });
    expect(await syncRes.json()).toEqual({ uploaded: 1, failed: 0 });

    const remoteClient = createClient(fakeNextcloudUrl, { username: "ncuser", password: "ncpass" });
    const remoteChemie = await remoteClient.getDirectoryContents("/Chemie");
    expect(remoteChemie).toHaveLength(1);
    await expect(remoteClient.getDirectoryContents("/Mathe")).rejects.toThrow();
  });

  it("only pulls files from within the configured subfolder", async () => {
    const repo = await createRepository("Scoped Pull Test");
    await fetch(`${baseUrl}/api/nextcloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ url: fakeNextcloudUrl, username: "ncuser", password: "ncpass" }),
    });
    await fetch(`${baseUrl}/api/nextcloud/sync-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ syncPath: "Chemie" }),
    });

    mkdirSync(join(fakeNextcloudDir, "Chemie"), { recursive: true });
    mkdirSync(join(fakeNextcloudDir, "Mathe"), { recursive: true });
    writeFileSync(join(fakeNextcloudDir, "Chemie", "Neu.pdf"), "aus chemie");
    writeFileSync(join(fakeNextcloudDir, "Mathe", "Neu.pdf"), "aus mathe");

    const pullRes = await fetch(`${baseUrl}/api/nextcloud/pull`, {
      method: "POST",
      headers: { Cookie: repo.cookie },
    });
    // The shared fake Nextcloud already has "Chemie/Reaktion.pdf" from the
    // previous test in this block, plus "Chemie/Neu.pdf" written just above
    // — both are new to this fresh repository, so both get pulled.
    expect(await pullRes.json()).toEqual({ downloaded: 2, failed: 0 });

    const pulled = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Chemie/Neu.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await pulled.text()).toBe("aus chemie");

    const notPulled = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Mathe/Neu.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(notPulled.status).toBe(404);
  });
});

describe("weekly digest email", () => {
  it("emails a working, time-limited link to the whole library", async () => {
    receivedEmails.length = 0;
    const repo = await createRepository("Digest Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Etwas.pdf", Buffer.from("Digest-Inhalt"));

    await fetch(`${baseUrl}/api/notifications/digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ enabled: true }),
    });

    const { runBackupChecks } = await import("./lib/backup-check.js");
    await runBackupChecks();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedEmails).toHaveLength(1);
    expect(receivedEmails[0].to).toContain(repo.email);
    const match = receivedEmails[0].text.match(/\/s\/(\w+)/);
    expect(match).not.toBeNull();

    const shareId = match![1];
    const downloadRes = await fetch(`${baseUrl}/api/share/${shareId}/download`);
    expect(downloadRes.status).toBe(200);
  });

  it("does not send a second digest before a week has passed", async () => {
    receivedEmails.length = 0;
    const repo = await createRepository("Digest Repeat Test");
    const client = webdavClientFor(repo);
    await client.putFileContents("/Etwas.pdf", Buffer.from("x"));

    await fetch(`${baseUrl}/api/notifications/digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ enabled: true }),
    });

    const { runBackupChecks } = await import("./lib/backup-check.js");
    await runBackupChecks();
    await runBackupChecks();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedEmails).toHaveLength(1);
  });
});
