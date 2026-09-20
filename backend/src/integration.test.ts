import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      email: `integration${emailCounter}@example.com`,
      password: "sicheres-passwort",
    }),
  });
  return (await res.json()) as {
    repositoryId: string;
    pin: string;
    webdav: { username: string; password: string };
  };
}

async function loginCookie(repositoryId: string, pin: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryId, pin }),
  });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "goodshare-integration-"));
  process.env.DATABASE_PATH = join(tempDir, "test.sqlite");
  process.env.FILES_DIR = join(tempDir, "files");
  process.env.JWT_SECRET = "test-secret";
  process.env.ENCRYPTION_KEY =
    "1111111111111111111111111111111111111111111111111111111111111111".slice(0, 64);
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

describe("WebDAV upload from GoodNotes' point of view", () => {
  it("accepts an upload with the issued credentials and it shows up in the file tree", async () => {
    const repo = await createRepository("WebDAV Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });

    await client.createDirectory("/Mathe", { recursive: true });
    await client.putFileContents("/Mathe/Vektoren.pdf", Buffer.from("PDF-INHALT"));

    const cookie = await loginCookie(repo.repositoryId, repo.pin);
    const treeRes = await fetch(`${baseUrl}/api/files/tree`, {
      headers: { Cookie: cookie },
    });
    const { tree } = await treeRes.json();

    expect(tree).toEqual([
      expect.objectContaining({
        name: "Mathe",
        type: "folder",
        children: [
          expect.objectContaining({ name: "Vektoren.pdf", type: "file" }),
        ],
      }),
    ]);

    const downloadRes = await fetch(
      `${baseUrl}/api/files/download?path=${encodeURIComponent("Mathe/Vektoren.pdf")}`,
      { headers: { Cookie: cookie } }
    );
    expect(await downloadRes.text()).toBe("PDF-INHALT");
  });

  it("rejects an upload with the wrong WebDAV password", async () => {
    const repo = await createRepository("WebDAV Wrong Password");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: "totally-wrong",
    });

    await expect(
      client.putFileContents("/x.pdf", Buffer.from("x"))
    ).rejects.toThrow();
  });

  it("keeps two repositories' files completely separate", async () => {
    const repoA = await createRepository("Repo A");
    const repoB = await createRepository("Repo B");

    const clientA = createClient(`${baseUrl}/webdav/${repoA.repositoryId}`, {
      username: repoA.webdav.username,
      password: repoA.webdav.password,
    });
    await clientA.putFileContents("/geheim.pdf", Buffer.from("A"));

    const clientB = createClient(`${baseUrl}/webdav/${repoB.repositoryId}`, {
      username: repoB.webdav.username,
      password: repoB.webdav.password,
    });
    const contentsB = await clientB.getDirectoryContents("/");
    expect(contentsB).toEqual([]);

    // Repo B's credentials must not work against repo A's WebDAV endpoint.
    const crossClient = createClient(`${baseUrl}/webdav/${repoA.repositoryId}`, {
      username: repoB.webdav.username,
      password: repoB.webdav.password,
    });
    await expect(crossClient.getDirectoryContents("/")).rejects.toThrow();
  });
});

describe("folder download as zip", () => {
  it("returns a zip file for a folder", async () => {
    const repo = await createRepository("Zip Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.putFileContents("/Notiz.pdf", Buffer.from("Inhalt"));

    const cookie = await loginCookie(repo.repositoryId, repo.pin);
    const res = await fetch(`${baseUrl}/api/files/download-zip?path=`, {
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 2).toString()).toBe("PK"); // zip file signature
  });
});

describe("share links", () => {
  it("lets anyone with the link download a file without a password", async () => {
    const repo = await createRepository("Share Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.putFileContents("/Freigabe.pdf", Buffer.from("Öffentlich"));

    const cookie = await loginCookie(repo.repositoryId, repo.pin);
    const createRes = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ path: "Freigabe.pdf" }),
    });
    const { id } = await createRes.json();

    const infoRes = await fetch(`${baseUrl}/api/share/${id}`);
    expect(await infoRes.json()).toMatchObject({
      name: "Freigabe.pdf",
      type: "file",
      requiresPassword: false,
    });

    const downloadRes = await fetch(`${baseUrl}/api/share/${id}/download`);
    expect(await downloadRes.text()).toBe("Öffentlich");
  });

  it("requires the correct password before a protected link can be downloaded", async () => {
    const repo = await createRepository("Share Password Test");
    const client = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await client.putFileContents("/Geheim.pdf", Buffer.from("Geheimnis"));

    const cookie = await loginCookie(repo.repositoryId, repo.pin);
    const createRes = await fetch(`${baseUrl}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ path: "Geheim.pdf", password: "sesam1234" }),
    });
    const { id } = await createRes.json();

    const infoRes = await fetch(`${baseUrl}/api/share/${id}`);
    expect(await infoRes.json()).toMatchObject({ requiresPassword: true });

    const withoutToken = await fetch(`${baseUrl}/api/share/${id}/download`);
    expect(withoutToken.status).toBe(401);

    const wrongUnlock = await fetch(`${baseUrl}/api/share/${id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "falsch" }),
    });
    expect(wrongUnlock.status).toBe(401);

    const unlock = await fetch(`${baseUrl}/api/share/${id}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "sesam1234" }),
    });
    const { token } = await unlock.json();

    const downloadRes = await fetch(
      `${baseUrl}/api/share/${id}/download?token=${token}`
    );
    expect(await downloadRes.text()).toBe("Geheimnis");
  });

  it("returns 404 for an unknown share link", async () => {
    const res = await fetch(`${baseUrl}/api/share/does-not-exist`);
    expect(res.status).toBe(404);
  });
});

describe("Nextcloud export", () => {
  let fakeNextcloudDir: string;
  let fakeNextcloudServer: InstanceType<typeof webdavServer.WebDAVServer>;
  let fakeNextcloudHttpServer: import("http").Server;
  let fakeNextcloudUrl: string;

  beforeAll(async () => {
    fakeNextcloudDir = mkdtempSync(join(tmpdir(), "fake-nextcloud-"));
    const userManager = new webdavServer.SimpleUserManager();
    userManager.addUser("ncuser", "ncpass");

    fakeNextcloudServer = new webdavServer.WebDAVServer({
      port: 0, // ephemeral: pick any free port
      hostname: "127.0.0.1", // this library defaults to "::", which isn't available everywhere
      requireAuthentification: true,
      httpAuthentication: new webdavServer.HTTPBasicAuthentication(
        userManager,
        "FakeNextcloud"
      ),
      rootFileSystem: new webdavServer.PhysicalFileSystem(fakeNextcloudDir),
    });

    // Note: .start(0, cb) does NOT mean "ephemeral port" here — the library
    // treats a falsy port argument as "use options.port", so the port must
    // be set via the constructor instead and only the callback passed here.
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

  it("connects, tests the credentials, and mirrors files into the Nextcloud", async () => {
    const repo = await createRepository("Nextcloud Test");
    const webdavClient = createClient(`${baseUrl}/webdav/${repo.repositoryId}`, {
      username: repo.webdav.username,
      password: repo.webdav.password,
    });
    await webdavClient.createDirectory("/Chemie", { recursive: true });
    await webdavClient.putFileContents("/Chemie/Reaktionen.pdf", Buffer.from("Reaktion"));

    const cookie = await loginCookie(repo.repositoryId, repo.pin);

    const badConnect = await fetch(`${baseUrl}/api/nextcloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        url: fakeNextcloudUrl,
        username: "ncuser",
        password: "wrong-password",
      }),
    });
    expect(badConnect.status).toBe(400);

    const connect = await fetch(`${baseUrl}/api/nextcloud`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        url: fakeNextcloudUrl,
        username: "ncuser",
        password: "ncpass",
      }),
    });
    expect(connect.status).toBe(201);

    const sync = await fetch(`${baseUrl}/api/nextcloud/sync`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(await sync.json()).toEqual({ uploaded: 1, failed: 0 });

    const mirroredContent = readFileSync(
      join(fakeNextcloudDir, "Chemie", "Reaktionen.pdf"),
      "utf8"
    );
    expect(mirroredContent).toBe("Reaktion");
  });
});
