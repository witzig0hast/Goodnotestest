import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30 s) —
 * the codes authenticator apps like Google Authenticator, 1Password or
 * Aegis generate. The shared secret is stored encrypted like the
 * Nextcloud password.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return binary.toString().padStart(DIGITS, "0");
}

/** Accepts the current code and its neighbours (±30 s clock drift). */
export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  const given = Buffer.from(code.replace(/\s/g, ""));
  if (given.length !== DIGITS) return false;
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpCode(secret, atMs + drift * STEP_SECONDS * 1000));
    if (timingSafeEqual(expected, given)) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, account: string): string {
  const label = encodeURIComponent(`GoodShare:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=GoodShare&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export function isTotpEnabled(repositoryId: string): boolean {
  const row = db.prepare("SELECT totp_enabled FROM repositories WHERE id = ?").get(repositoryId) as
    | { totp_enabled: number }
    | undefined;
  return row?.totp_enabled === 1;
}

export function getTotpSecret(repositoryId: string): string | null {
  const row = db.prepare("SELECT totp_secret_enc FROM repositories WHERE id = ?").get(repositoryId) as
    | { totp_secret_enc: string | null }
    | undefined;
  return row?.totp_secret_enc ? decryptSecret(row.totp_secret_enc) : null;
}

export function enableTotp(repositoryId: string, secret: string): void {
  db.prepare("UPDATE repositories SET totp_secret_enc = ?, totp_enabled = 1 WHERE id = ?").run(
    encryptSecret(secret),
    repositoryId
  );
}

export function disableTotp(repositoryId: string): void {
  db.prepare("UPDATE repositories SET totp_secret_enc = NULL, totp_enabled = 0 WHERE id = ?").run(repositoryId);
}
