import rateLimit from "express-rate-limit";
import { config } from "../lib/config.js";

// Rate limiting is noisy in the test suite (which legitimately creates
// dozens of accounts and logs in dozens of times per file) and would make
// those tests flaky or require awkward workarounds. It's skipped whenever
// NODE_ENV=test — which only happens under the test runner, never in a
// real deployment — unless a test explicitly opts back in (via
// FORCE_RATE_LIMIT=true) to verify the limiter itself.
function skipInTests() {
  return process.env.NODE_ENV === "test" && process.env.FORCE_RATE_LIMIT !== "true";
}

const TOO_MANY_REQUESTS_MESSAGE = {
  error: "Zu viele Versuche. Bitte warte eine Weile, bevor du es erneut versuchst.",
};

// Both credentials tried together (email/password login, passkey
// assertions) — generous enough for normal use, strict enough to make
// password-guessing impractical.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_MESSAGE,
  skip: skipInTests,
});

// The repository-ID + 4-digit-code fallback login has a tiny keyspace
// (10,000 codes), so it gets a noticeably stricter limit than the other
// login methods.
export const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.pinLoginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_MESSAGE,
  skip: skipInTests,
});

// Share links can be password-protected — this stops someone from sitting
// on a link and brute-forcing its password.
export const shareUnlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.shareUnlockMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_MESSAGE,
  skip: skipInTests,
});

// Registration is gated by admin approval already, so this limiter exists
// mainly to stop scripted account-creation floods from burning CPU on
// bcrypt hashing and filling the database.
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimits.registrationMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_MESSAGE,
  skip: skipInTests,
});

// The iOS Shortcut endpoint authenticates with the WebDAV password (high
// entropy, so brute-forcing it isn't realistic) — this limiter is about
// capping abuse/flooding rather than credential stuffing.
export const quickShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.quickShareMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS_MESSAGE,
  skip: skipInTests,
});
