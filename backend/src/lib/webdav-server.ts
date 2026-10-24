import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { v2 as webdav } from "webdav-server";
import { findRepositoryById } from "./repositories.js";
import { ensureRepositoryDir } from "./storage.js";
import { snapshotBeforeOverwrite } from "./versions.js";
import { recordUpload } from "./backup-history.js";
import { moveToTrash } from "./trash.js";
import { recordWebdavFailure, recordWebdavSuccess } from "./webdav-status.js";

/**
 * Keeps GoodNotes' own habit of just re-uploading a file with the same
 * name from silently destroying the previous version — every overwrite
 * gets snapshotted first (see versions.ts) before the write proceeds.
 */
class VersioningPhysicalFileSystem extends webdav.PhysicalFileSystem {
  constructor(
    private readonly repositoryId: string,
    rootPath: string
  ) {
    super(rootPath);
  }

  protected _openWriteStream(
    path: webdav.Path,
    ctx: webdav.OpenWriteStreamInfo,
    callback: webdav.ReturnCallback<import("node:stream").Writable>
  ) {
    const { realPath } = this.getRealPath(path);
    const relativePath = path.toString().replace(/^\/+/, "");

    snapshotBeforeOverwrite(this.repositoryId, relativePath, realPath)
      .catch(() => {
        // Never block a GoodNotes sync just because we couldn't snapshot
        // the previous version — the new write should still go through.
      })
      .then(() => {
        try {
          recordUpload(this.repositoryId);
        } catch {
          // statistics only — never fail the upload over it
        }
        super._openWriteStream(path, ctx, callback);
      });
  }
}

/**
 * Deletions GoodNotes makes over WebDAV go to the trash too, so a note
 * deleted on the iPad can still be recovered here. The one exception is a
 * MOVE that overwrites its destination (an upload via temp file + rename):
 * that's an overwrite, not a deletion, so the old file is only snapshotted
 * into the version history like any other overwrite.
 */
class TrashingFileSystem extends VersioningPhysicalFileSystem {
  private readonly overwriteTargets = new Set<string>();

  constructor(
    private readonly trashRepositoryId: string,
    rootPath: string
  ) {
    super(trashRepositoryId, rootPath);
  }

  protected _move(
    pathFrom: webdav.Path,
    pathTo: webdav.Path,
    ctx: webdav.MoveInfo,
    callback: webdav.ReturnCallback<boolean>
  ) {
    const target = pathTo.toString();
    this.overwriteTargets.add(target);
    super._move(pathFrom, pathTo, ctx, (e, overwritten) => {
      this.overwriteTargets.delete(target);
      callback(e, overwritten);
    });
  }

  protected _delete(path: webdav.Path, ctx: webdav.DeleteInfo, callback: webdav.SimpleCallback) {
    const key = path.toString();
    const relativePath = key.replace(/^\/+/, "");
    const fallback = () => super._delete(path, ctx, callback);

    if (!relativePath) return fallback();

    if (this.overwriteTargets.has(key)) {
      const { realPath } = this.getRealPath(path);
      snapshotBeforeOverwrite(this.trashRepositoryId, relativePath, realPath)
        .catch(() => {})
        .then(fallback);
      return;
    }

    moveToTrash(this.trashRepositoryId, relativePath, "goodnotes")
      .then(() => {
        // webdav-server caches per-path resource metadata; drop the entry
        // the same way its own _delete does on success.
        delete (this as unknown as { resources: Record<string, unknown> }).resources[key];
        callback();
      })
      // If moving to the trash fails for whatever reason, still honour
      // the delete rather than leaving GoodNotes' backup half-applied.
      .catch(fallback);
  }
}

const ANONYMOUS_USER: webdav.IUser = {
  uid: "anonymous",
  username: "anonymous",
  isAdministrator: false,
  isDefaultUser: true,
};

/**
 * Each repository gets its own isolated WebDAVServer instance, rooted at
 * that repository's own directory and only accepting that repository's own
 * WebDAV credentials — this keeps repositories from ever being able to see
 * each other, without having to reimplement WebDAV path scoping by hand.
 */
class RepositoryUserManager implements webdav.ITestableUserManager {
  constructor(private readonly repositoryId: string) {}

  getDefaultUser(callback: (user: webdav.IUser) => void) {
    callback(ANONYMOUS_USER);
  }

  getUserByNamePassword(
    name: string,
    password: string,
    callback: (error: Error, user?: webdav.IUser) => void
  ) {
    const repo = findRepositoryById(this.repositoryId);
    if (!repo || repo.webdavUsername !== name) {
      if (repo) recordWebdavFailure(repo.id, "unknown_user");
      callback(new Error("Unbekannter Benutzer."));
      return;
    }
    if (!bcrypt.compareSync(password, repo.webdavPasswordHash)) {
      recordWebdavFailure(repo.id, "wrong_password");
      callback(new Error("Falsches Passwort."));
      return;
    }
    if (repo.approvalStatus !== "approved") {
      recordWebdavFailure(repo.id, "pending_approval");
      callback(new Error("Konto wartet noch auf Freigabe."));
      return;
    }
    recordWebdavSuccess(repo.id);
    callback(null as unknown as Error, {
      uid: repo.id,
      username: repo.webdavUsername,
      isAdministrator: true,
    });
  }
}

const serverCache = new Map<string, webdav.WebDAVServer>();

function getServerForRepository(repositoryId: string): webdav.WebDAVServer {
  const cached = serverCache.get(repositoryId);
  if (cached) return cached;

  const dir = ensureRepositoryDir(repositoryId);
  const server = new webdav.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(
      new RepositoryUserManager(repositoryId),
      "GoodShare"
    ),
    rootFileSystem: new TrashingFileSystem(repositoryId, dir),
  });

  serverCache.set(repositoryId, server);
  return server;
}

export function handleWebdavRequest(req: Request, res: Response) {
  const { repositoryId } = req.params;
  const repo = findRepositoryById(repositoryId);
  if (!repo) {
    res.status(404).send("Repository nicht gefunden.");
    return;
  }
  if (repo.approvalStatus !== "approved") {
    res.status(403).send("Konto wartet noch auf Freigabe.");
    return;
  }

  const server = getServerForRepository(repositoryId);
  server.executeRequest(req, res, `/webdav/${repositoryId}`);
}
