import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type FileStat, type WebDAVClient } from "webdav";
import { buildTreeAt, flattenFiles } from "./file-tree.js";
import { resolveSafePath } from "./storage.js";

export interface NextcloudCredentials {
  url: string;
  username: string;
  password: string;
}

function client(credentials: NextcloudCredentials): WebDAVClient {
  return createClient(credentials.url, {
    username: credentials.username,
    password: credentials.password,
  });
}

/** Throws if the credentials don't work or the URL isn't a WebDAV server. */
export async function testNextcloudConnection(
  credentials: NextcloudCredentials
): Promise<void> {
  await client(credentials).getDirectoryContents("/");
}

export interface SyncResult {
  uploaded: number;
  failed: number;
}

/**
 * Mirrors every file in a repository into the connected Nextcloud, using
 * the same folder structure. Existing files are simply overwritten — this
 * is a full one-way push, not an incremental diff, which keeps the logic
 * simple for the size of library a single person's GoodNotes backup is.
 */
export async function syncRepositoryToNextcloud(
  repositoryId: string,
  credentials: NextcloudCredentials,
  syncPath = ""
): Promise<SyncResult> {
  const c = client(credentials);
  const rootAbsolute = resolveSafePath(repositoryId, syncPath);
  const tree = await buildTreeAt(rootAbsolute, syncPath);
  const files = flattenFiles(tree);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const remotePath = "/" + file.path;
    const remoteDir = path.posix.dirname(remotePath);

    try {
      if (remoteDir !== "/" && remoteDir !== ".") {
        await c.createDirectory(remoteDir, { recursive: true }).catch(() => {});
      }
      const absolutePath = resolveSafePath(repositoryId, file.path);
      await c.putFileContents(remotePath, createReadStream(absolutePath), {
        overwrite: true,
      });
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed };
}

// Depth:infinity PROPFIND (the "deep" option) isn't something every WebDAV
// server supports equally well, so the remote tree is walked one directory
// at a time instead — slower, but works the same against any WebDAV server.
async function listRemoteFilesRecursive(
  c: WebDAVClient,
  dir: string
): Promise<FileStat[]> {
  const entries = (await c.getDirectoryContents(dir)) as FileStat[];
  const files: FileStat[] = [];

  for (const entry of entries) {
    if (entry.type === "directory") {
      files.push(...(await listRemoteFilesRecursive(c, entry.filename)));
    } else {
      files.push(entry);
    }
  }

  return files;
}

export interface PullResult {
  downloaded: number;
  failed: number;
}

/**
 * Downloads files that exist in the connected Nextcloud but not locally.
 * Deliberately one-directional and additive only — it never deletes or
 * overwrites a local file, so there's no way for this to lose data even if
 * the two sides have diverged.
 */
export async function pullMissingFromNextcloud(
  repositoryId: string,
  credentials: NextcloudCredentials,
  syncPath = ""
): Promise<PullResult> {
  const c = client(credentials);
  const remoteFiles = await listRemoteFilesRecursive(c, syncPath ? `/${syncPath}` : "/").catch(
    () => [] as FileStat[]
  );

  let downloaded = 0;
  let failed = 0;

  for (const remoteFile of remoteFiles) {
    const relativePath = remoteFile.filename.replace(/^\/+/, "");
    if (!relativePath) continue;

    let absolutePath: string;
    try {
      absolutePath = resolveSafePath(repositoryId, relativePath);
    } catch {
      failed += 1;
      continue;
    }

    try {
      await fs.access(absolutePath);
      continue; // already exists locally — never overwrite
    } catch {
      // doesn't exist locally yet, proceed to download it
    }

    try {
      const content = (await c.getFileContents(remoteFile.filename)) as Buffer;
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content);
      downloaded += 1;
    } catch {
      failed += 1;
    }
  }

  return { downloaded, failed };
}
