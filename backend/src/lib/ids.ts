import { randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

// No 0/O/1/I/l — avoids people misreading IDs when typing them by hand.
const UNAMBIGUOUS_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// 6 characters from a 31-letter alphabet is ~887 million combinations —
// plenty to avoid collisions while staying short enough to read out loud.
export const generateRepositoryId = customAlphabet(UNAMBIGUOUS_ALPHABET, 6);
export const generateShareLinkId = customAlphabet(
  UNAMBIGUOUS_ALPHABET + "abcdefghjkmnpqrstuvwxyz",
  12
);
export const generateWebdavUsername = customAlphabet(UNAMBIGUOUS_ALPHABET, 10);
export const generateWebdavPassword = customAlphabet(
  UNAMBIGUOUS_ALPHABET + "abcdefghjkmnpqrstuvwxyz23456789",
  24
);

/** A stable per-account handle WebAuthn needs, unrelated to any PII. */
export function generateWebauthnUserHandle(): string {
  return randomBytes(32).toString("base64url");
}

export function generatePin(): string {
  // A true 4-digit PIN, including leading zeros (e.g. "0042").
  const n = Math.floor(Math.random() * 10000);
  return n.toString().padStart(4, "0");
}
