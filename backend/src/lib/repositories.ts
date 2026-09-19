import bcrypt from "bcryptjs";
import { db } from "./db.js";
import {
  generatePin,
  generateRepositoryId,
  generateWebdavPassword,
  generateWebdavUsername,
} from "./ids.js";

export interface RepositoryRecord {
  id: string;
  name: string;
  pinHash: string;
  webdavUsername: string;
  webdavPasswordHash: string;
  createdAt: string;
}

export interface NewRepositorySecrets {
  id: string;
  name: string;
  pin: string;
  webdavUsername: string;
  webdavPassword: string;
}

const PIN_HASH_ROUNDS = 10;
const WEBDAV_PASSWORD_HASH_ROUNDS = 10;

function toRecord(row: {
  id: string;
  name: string;
  pin_hash: string;
  webdav_username: string;
  webdav_password_hash: string;
  created_at: string;
}): RepositoryRecord {
  return {
    id: row.id,
    name: row.name,
    pinHash: row.pin_hash,
    webdavUsername: row.webdav_username,
    webdavPasswordHash: row.webdav_password_hash,
    createdAt: row.created_at,
  };
}

export function createRepository(name: string): NewRepositorySecrets {
  const id = generateRepositoryId();
  const pin = generatePin();
  const webdavUsername = generateWebdavUsername();
  const webdavPassword = generateWebdavPassword();

  const pinHash = bcrypt.hashSync(pin, PIN_HASH_ROUNDS);
  const webdavPasswordHash = bcrypt.hashSync(
    webdavPassword,
    WEBDAV_PASSWORD_HASH_ROUNDS
  );

  db.prepare(
    `INSERT INTO repositories (id, name, pin_hash, webdav_username, webdav_password_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, pinHash, webdavUsername, webdavPasswordHash);

  return { id, name, pin, webdavUsername, webdavPassword };
}

export function findRepositoryById(id: string): RepositoryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM repositories WHERE id = ?")
    .get(id) as
    | {
        id: string;
        name: string;
        pin_hash: string;
        webdav_username: string;
        webdav_password_hash: string;
        created_at: string;
      }
    | undefined;
  return row ? toRecord(row) : undefined;
}

export function findRepositoryByWebdavUsername(
  username: string
): RepositoryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM repositories WHERE webdav_username = ?")
    .get(username) as
    | {
        id: string;
        name: string;
        pin_hash: string;
        webdav_username: string;
        webdav_password_hash: string;
        created_at: string;
      }
    | undefined;
  return row ? toRecord(row) : undefined;
}

export function verifyPin(repo: RepositoryRecord, pin: string): boolean {
  return bcrypt.compareSync(pin, repo.pinHash);
}
