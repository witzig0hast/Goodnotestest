import { createReadStream } from "node:fs";
import path from "node:path";
import { createClient, type WebDAVClient } from "webdav";
import { buildRepositoryTree, type TreeNode } from "./file-tree.js";
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

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  const files: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") files.push(node);
    else if (node.children) files.push(...flattenFiles(node.children));
  }
  return files;
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
  credentials: NextcloudCredentials
): Promise<SyncResult> {
  const c = client(credentials);
  const tree = await buildRepositoryTree(repositoryId);
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
