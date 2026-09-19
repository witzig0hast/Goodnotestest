import { customAlphabet } from "nanoid";

// No 0/O/1/I/l — avoids people misreading IDs when typing them by hand.
const UNAMBIGUOUS_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const generateRepositoryId = customAlphabet(UNAMBIGUOUS_ALPHABET, 8);
export const generateWebdavUsername = customAlphabet(UNAMBIGUOUS_ALPHABET, 10);
export const generateWebdavPassword = customAlphabet(
  UNAMBIGUOUS_ALPHABET + "abcdefghjkmnpqrstuvwxyz23456789",
  24
);

export function generatePin(): string {
  // A true 4-digit PIN, including leading zeros (e.g. "0042").
  const n = Math.floor(Math.random() * 10000);
  return n.toString().padStart(4, "0");
}
