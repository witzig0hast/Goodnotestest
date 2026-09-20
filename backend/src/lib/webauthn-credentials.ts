import { db } from "./db.js";

export interface StoredCredential {
  id: string;
  repositoryId: string;
  publicKey: Buffer;
  counter: number;
  transports: string[];
}

interface CredentialRow {
  id: string;
  repository_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}

function toRecord(row: CredentialRow): StoredCredential {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    publicKey: Buffer.from(row.public_key, "base64url"),
    counter: row.counter,
    transports: row.transports ? JSON.parse(row.transports) : [],
  };
}

export function saveCredential(input: {
  id: string;
  repositoryId: string;
  publicKey: Uint8Array | Buffer;
  counter: number;
  transports?: string[];
}): void {
  db.prepare(
    `INSERT INTO webauthn_credentials (id, repository_id, public_key, counter, transports)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.repositoryId,
    Buffer.from(input.publicKey).toString("base64url"),
    input.counter,
    input.transports ? JSON.stringify(input.transports) : null
  );
}

export function findCredentialById(id: string): StoredCredential | undefined {
  const row = db
    .prepare("SELECT * FROM webauthn_credentials WHERE id = ?")
    .get(id) as CredentialRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function updateCredentialCounter(id: string, counter: number): void {
  db.prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?").run(counter, id);
}

export function listCredentialsForRepository(repositoryId: string): StoredCredential[] {
  const rows = db
    .prepare("SELECT * FROM webauthn_credentials WHERE repository_id = ?")
    .all(repositoryId) as CredentialRow[];
  return rows.map(toRecord);
}
