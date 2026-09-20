import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "webdav";
import { v2 as webdavServer } from "webdav-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { createApp } from "./app.js";

let app: ReturnType<typeof createApp>;
let baseUrl: string;
let tempDir: string;
let server: import("http").Server;
let emailCounter = 0;

async function createRepository(name: string) {
  emailCounter += 1;
  const res = await fetch(`${baseUrl}/api/repositories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email: `comfort${emailCounter}@example.com`,
      password: "sicheres-passwort",
    }),
  });
  const body = (await res.json()) as {
    repositoryId: string;
    webdav: { username: string; password: string };
  };
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { ...body, cookie };
}

async function makeTestPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 250, size: 14, font, color: rgb(0, 0, 0) });
  return doc.save();
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-comfort-test-"));
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.FILES_DIR = join(tempDir, "files");
  process.env.JWT_SECRET = "test-secret";
  process.env.FRONTEND_ORIGIN = "http://localhost:3000";

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
  rmSync(tempDir, { recursive: true, force: true });
});

describe("full-text search", () => {
  it("finds files by filename", async () => {
    const repo = await createRepository("Search Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.putFileContents(
      "/Chemie-Reaktionen.pdf",
      Buffer.from(await makeTestPdf("beliebiger Inhalt"))
    );

    const res = await fetch(`${baseUrl}/api/files/search?q=chemie`, {
      headers: { Cookie: repo.cookie },
    });
    const { results } = await res.json();
    expect(results).toEqual([
      expect.objectContaining({ name: "Chemie-Reaktionen.pdf", matchedIn: "filename" }),
    ]);
  });

  it("finds files by their embedded PDF text and returns a snippet", async () => {
    const repo = await createRepository("Content Search Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.putFileContents(
      "/Notiz.pdf",
      Buffer.from(await makeTestPdf("Photosynthese und Zellatmung"))
    );

    const res = await fetch(`${baseUrl}/api/files/search?q=photosynthese`, {
      headers: { Cookie: repo.cookie },
    });
    const { results } = await res.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "Notiz.pdf", matchedIn: "content" });
    expect(results[0].snippet.toLowerCase()).toContain("photosynthese");
  });

  it("returns nothing for a query that matches no file", async () => {
    const repo = await createRepository("Empty Search Test");
    const res = await fetch(`${baseUrl}/api/files/search?q=nichtvorhanden`, {
      headers: { Cookie: repo.cookie },
    });
    expect((await res.json()).results).toEqual([]);
  });
});

describe("merge folder to one PDF", () => {
  it("combines every PDF in a folder into a single downloadable PDF", async () => {
    const repo = await createRepository("Merge Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.createDirectory("/Mathe", { recursive: true });
    await client.putFileContents("/Mathe/Eins.pdf", Buffer.from(await makeTestPdf("Seite eins")));
    await client.putFileContents("/Mathe/Zwei.pdf", Buffer.from(await makeTestPdf("Seite zwei")));

    const res = await fetch(
      `${baseUrl}/api/files/download-pdf?path=${encodeURIComponent("Mathe")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");

    const buffer = Buffer.from(await res.arrayBuffer());
    const merged = await PDFDocument.load(buffer);
    expect(merged.getPageCount()).toBe(2);
  });
});

describe("favorites", () => {
  it("adds, lists, and removes a favorite", async () => {
    const repo = await createRepository("Favorites Test");

    await fetch(`${baseUrl}/api/files/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "Mathe/Eins.pdf" }),
    });

    const listRes = await fetch(`${baseUrl}/api/files/favorites`, {
      headers: { Cookie: repo.cookie },
    });
    expect((await listRes.json()).paths).toEqual(["Mathe/Eins.pdf"]);

    await fetch(`${baseUrl}/api/files/favorites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ path: "Mathe/Eins.pdf" }),
    });

    const afterRemove = await fetch(`${baseUrl}/api/files/favorites`, {
      headers: { Cookie: repo.cookie },
    });
    expect((await afterRemove.json()).paths).toEqual([]);
  });
});

describe("notification settings", () => {
  it("saves and reads back ntfy settings", async () => {
    const repo = await createRepository("Notifications Test");

    await fetch(`${baseUrl}/api/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({
        ntfyUrl: "https://ntfy.example.com",
        ntfyTopic: "goodshare-test",
        notifyAfterDays: 3,
      }),
    });

    const res = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Cookie: repo.cookie },
    });
    expect(await res.json()).toMatchObject({
      enabled: true,
      ntfyUrl: "https://ntfy.example.com",
      ntfyTopic: "goodshare-test",
      notifyAfterDays: 3,
    });
  });

  it("sends a real test push to a fake ntfy server", async () => {
    const received: { title?: string; body?: string }[] = [];
    const fakeNtfy = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ title: req.headers.title as string, body });
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => fakeNtfy.listen(0, "127.0.0.1", resolve));
    const port = (fakeNtfy.address() as AddressInfo).port;

    const repo = await createRepository("Test Push");
    const res = await fetch(`${baseUrl}/api/notifications/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({
        ntfyUrl: `http://127.0.0.1:${port}`,
        ntfyTopic: "test-topic",
        notifyAfterDays: 3,
      }),
    });

    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].body).toContain("Testnachricht");

    await new Promise((resolve) => fakeNtfy.close(resolve));
  });

  it("reports failure when the ntfy server is unreachable", async () => {
    const repo = await createRepository("Test Push Fail");
    const res = await fetch(`${baseUrl}/api/notifications/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({
        ntfyUrl: "http://127.0.0.1:1", // nothing listens here
        ntfyTopic: "test-topic",
        notifyAfterDays: 3,
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Nextcloud pull (additive only)", () => {
  let fakeNextcloudDir: string;
  let fakeNextcloudServer: InstanceType<typeof webdavServer.WebDAVServer>;
  let fakeNextcloudHttpServer: import("http").Server;
  let fakeNextcloudUrl: string;

  beforeAll(async () => {
    fakeNextcloudDir = mkdtempSync(join(tmpdir(), "fake-nextcloud-pull-"));
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
    const port = (fakeNextcloudHttpServer.address() as AddressInfo).port;
    fakeNextcloudUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fakeNextcloudServer.stop(() => resolve()));
    rmSync(fakeNextcloudDir, { recursive: true, force: true });
  });

  it("downloads files that exist remotely but not locally, without touching existing local files", async () => {
    const repo = await createRepository("Pull Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    // Already exists locally — must not be touched by the pull.
    await client.putFileContents("/Vorhanden.pdf", Buffer.from("lokale Version"));

    // Simulate files that were placed directly into Nextcloud (not via our
    // own sync), e.g. because someone edited them there.
    writeFileSync(join(fakeNextcloudDir, "Vorhanden.pdf"), "fremde Version, sollte ignoriert werden");
    writeFileSync(join(fakeNextcloudDir, "Neu.pdf"), "Inhalt aus der Nextcloud");

    await fetch(`${baseUrl}/api/nextcloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: repo.cookie },
      body: JSON.stringify({ url: fakeNextcloudUrl, username: "ncuser", password: "ncpass" }),
    });

    const pullRes = await fetch(`${baseUrl}/api/nextcloud/pull`, {
      method: "POST",
      headers: { Cookie: repo.cookie },
    });
    expect(await pullRes.json()).toEqual({ downloaded: 1, failed: 0 });

    const untouched = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Vorhanden.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await untouched.text()).toBe("lokale Version");

    const pulled = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Neu.pdf")}`,
      { headers: { Cookie: repo.cookie } }
    );
    expect(await pulled.text()).toBe("Inhalt aus der Nextcloud");
  });
});
