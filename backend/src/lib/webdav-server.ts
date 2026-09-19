import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { v2 as webdav } from "webdav-server";
import { findRepositoryById } from "./repositories.js";
import { ensureRepositoryDir } from "./storage.js";

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
      callback(new Error("Unbekannter Benutzer."));
      return;
    }
    if (!bcrypt.compareSync(password, repo.webdavPasswordHash)) {
      callback(new Error("Falsches Passwort."));
      return;
    }
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
    rootFileSystem: new webdav.PhysicalFileSystem(dir),
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

  const server = getServerForRepository(repositoryId);
  server.executeRequest(req, res, `/webdav/${repositoryId}`);
}
