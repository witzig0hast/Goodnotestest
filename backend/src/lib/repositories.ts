import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import {
  generatePin,
  generateRepositoryId,
  generateWebauthnUserHandle,
  generateWebdavPassword,
  generateWebdavUsername,
} from "./ids.js";
import { ensureRepositoryDir } from "./storage.js";

export interface RepositoryRecord {
  id: string;
  name: string;
  pinHash: string;
  webdavUsername: string;
  webdavPasswordHash: string;
  nextcloudUrl: string | null;
  nextcloudUsername: string | null;
  nextcloudPasswordEnc: string | null;
  email: string | null;
  passwordHash: string | null;
  webauthnUserHandle: string | null;
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
const PASSWORD_HASH_ROUNDS = 12;

interface RepositoryRow {
  id: string;
  name: string;
  pin_hash: string;
  webdav_username: string;
  webdav_password_hash: string;
  nextcloud_url: string | null;
  nextcloud_username: string | null;
  nextcloud_password_enc: string | null;
  email: string | null;
  password_hash: string | null;
  webauthn_user_handle: string | null;
  created_at: string;
}

function toRecord(row: RepositoryRow): RepositoryRecord {
  return {
    id: row.id,
    name: row.name,
    pinHash: row.pin_hash,
    webdavUsername: row.webdav_username,
    webdavPasswordHash: row.webdav_password_hash,
    nextcloudUrl: row.nextcloud_url,
    nextcloudUsername: row.nextcloud_username,
    nextcloudPasswordEnc: row.nextcloud_password_enc,
    email: row.email,
    passwordHash: row.password_hash,
    webauthnUserHandle: row.webauthn_user_handle,
    createdAt: row.created_at,
  };
}

export function createRepository(input: {
  name: string;
  email: string;
  password: string;
}): NewRepositorySecrets {
  const id = generateRepositoryId();
  const pin = generatePin();
  const webdavUsername = generateWebdavUsername();
  const webdavPassword = generateWebdavPassword();
  const webauthnUserHandle = generateWebauthnUserHandle();

  const pinHash = bcrypt.hashSync(pin, PIN_HASH_ROUNDS);
  const webdavPasswordHash = bcrypt.hashSync(
    webdavPassword,
    WEBDAV_PASSWORD_HASH_ROUNDS
  );
  const passwordHash = bcrypt.hashSync(input.password, PASSWORD_HASH_ROUNDS);

  db.prepare(
    `INSERT INTO repositories
       (id, name, pin_hash, webdav_username, webdav_password_hash, email, password_hash, webauthn_user_handle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    pinHash,
    webdavUsername,
    webdavPasswordHash,
    input.email.toLowerCase(),
    passwordHash,
    webauthnUserHandle
  );

  ensureRepositoryDir(id);

  return { id, name: input.name, pin, webdavUsername, webdavPassword };
}

export function findRepositoryById(id: string): RepositoryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM repositories WHERE id = ?")
    .get(id) as RepositoryRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function findRepositoryByWebdavUsername(
  username: string
): RepositoryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM repositories WHERE webdav_username = ?")
    .get(username) as RepositoryRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function findRepositoryByEmail(email: string): RepositoryRecord | undefined {
  const row = db
    .prepare("SELECT * FROM repositories WHERE email = ?")
    .get(email.toLowerCase()) as RepositoryRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function verifyPin(repo: RepositoryRecord, pin: string): boolean {
  return bcrypt.compareSync(pin, repo.pinHash);
}

export function verifyPassword(repo: RepositoryRecord, password: string): boolean {
  return Boolean(repo.passwordHash) && bcrypt.compareSync(password, repo.passwordHash!);
}

/**
 * Repositories created before passkeys existed don't have a WebAuthn user
 * handle yet — this lazily assigns one the first time it's needed, so
 * older accounts can still add a passkey.
 */
export function ensureWebauthnUserHandle(repo: RepositoryRecord): string {
  if (repo.webauthnUserHandle) return repo.webauthnUserHandle;
  const handle = generateWebauthnUserHandle();
  db.prepare("UPDATE repositories SET webauthn_user_handle = ? WHERE id = ?").run(
    handle,
    repo.id
  );
  return handle;
}

export function setNextcloudConnection(
  repositoryId: string,
  connection: { url: string; username: string; password: string }
): void {
  db.prepare(
    `UPDATE repositories
     SET nextcloud_url = ?, nextcloud_username = ?, nextcloud_password_enc = ?
     WHERE id = ?`
  ).run(
    connection.url,
    connection.username,
    encryptSecret(connection.password),
    repositoryId
  );
}

export function clearNextcloudConnection(repositoryId: string): void {
  db.prepare(
    `UPDATE repositories
     SET nextcloud_url = NULL, nextcloud_username = NULL, nextcloud_password_enc = NULL
     WHERE id = ?`
  ).run(repositoryId);
}

export function getNextcloudCredentials(
  repo: RepositoryRecord
): { url: string; username: string; password: string } | null {
  if (!repo.nextcloudUrl || !repo.nextcloudUsername || !repo.nextcloudPasswordEnc) {
    return null;
  }
  return {
    url: repo.nextcloudUrl,
    username: repo.nextcloudUsername,
    password: decryptSecret(repo.nextcloudPasswordEnc),
  };
}
