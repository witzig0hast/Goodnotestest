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
  ntfyUrl: string | null;
  ntfyTopic: string | null;
  notifyAfterDays: number | null;
  lastNotifiedAt: string | null;
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
  ntfy_url: string | null;
  ntfy_topic: string | null;
  notify_after_days: number | null;
  last_notified_at: string | null;
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
    ntfyUrl: row.ntfy_url,
    ntfyTopic: row.ntfy_topic,
    notifyAfterDays: row.notify_after_days,
    lastNotifiedAt: row.last_notified_at,
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

export function setNotificationSettings(
  repositoryId: string,
  settings: { ntfyUrl: string; ntfyTopic: string; notifyAfterDays: number }
): void {
  db.prepare(
    `UPDATE repositories
     SET ntfy_url = ?, ntfy_topic = ?, notify_after_days = ?, last_notified_at = NULL
     WHERE id = ?`
  ).run(settings.ntfyUrl, settings.ntfyTopic, settings.notifyAfterDays, repositoryId);
}

export function clearNotificationSettings(repositoryId: string): void {
  db.prepare(
    `UPDATE repositories
     SET ntfy_url = NULL, ntfy_topic = NULL, notify_after_days = NULL, last_notified_at = NULL
     WHERE id = ?`
  ).run(repositoryId);
}

export function updateLastNotifiedAt(repositoryId: string, iso: string): void {
  db.prepare("UPDATE repositories SET last_notified_at = ? WHERE id = ?").run(
    iso,
    repositoryId
  );
}

export function listRepositoriesWithNotifications(): RepositoryRecord[] {
  const rows = db
    .prepare("SELECT * FROM repositories WHERE ntfy_url IS NOT NULL AND ntfy_topic IS NOT NULL")
    .all() as RepositoryRow[];
  return rows.map(toRecord);
}
