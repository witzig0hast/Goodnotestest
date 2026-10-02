import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEV_ONLY_JWT_SECRET = "dev-only-secret-change-me";
const DEV_ONLY_ENCRYPTION_KEY =
  "2132b2fd14c842b81a841014895dc9505a58f32c54b54b4dd1d5454ea929787f";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: required("DATABASE_PATH", "./data/goodshare.sqlite"),
  filesDir: required("FILES_DIR", "./data/files"),
  versionsDir: required("VERSIONS_DIR", "./data/versions"),
  thumbnailsDir: required("THUMBNAILS_DIR", "./data/thumbnails"),
  jwtSecret: required("JWT_SECRET", DEV_ONLY_JWT_SECRET),
  encryptionKey: required("ENCRYPTION_KEY", DEV_ONLY_ENCRYPTION_KEY),
  frontendOrigin: required("FRONTEND_ORIGIN", "http://localhost:3000"),
  // GoodShare is meant to run behind a reverse proxy (Nginx Proxy Manager,
  // Cloudflare, …). Express needs to be told how many proxy hops to trust
  // so it reads the real client IP from X-Forwarded-For instead of the
  // proxy's own IP — otherwise every visitor shares one rate-limit bucket.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  rateLimits: {
    // Deliberately configurable: self-hosters with unusual traffic patterns
    // can loosen these via env vars without a code change, but every
    // default below is already tuned for a small, personal/team instance.
    loginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 20),
    pinLoginMax: Number(process.env.RATE_LIMIT_PIN_LOGIN_MAX ?? 10),
    shareUnlockMax: Number(process.env.RATE_LIMIT_SHARE_UNLOCK_MAX ?? 15),
    registrationMax: Number(process.env.RATE_LIMIT_REGISTRATION_MAX ?? 50),
    quickShareMax: Number(process.env.RATE_LIMIT_QUICK_SHARE_MAX ?? 60),
  },
};

// The two fallbacks above exist only so `npm run dev` works out of the box
// without a .env file — they're sitting in this public repository in plain
// text, so anyone could forge sessions or decrypt stored Nextcloud
// passwords on an instance that still uses them. Refuse to boot in
// production rather than silently running with secrets an attacker already
// knows, or with a JWT secret too short to resist brute-forcing.
if (process.env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (config.jwtSecret === DEV_ONLY_JWT_SECRET) {
    problems.push("JWT_SECRET is still the publicly-known development default");
  } else if (config.jwtSecret.length < 32) {
    problems.push("JWT_SECRET is shorter than 32 characters");
  }
  if (config.encryptionKey === DEV_ONLY_ENCRYPTION_KEY) {
    problems.push("ENCRYPTION_KEY is still the publicly-known development default");
  } else if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
    problems.push("ENCRYPTION_KEY must be a 64-character hex string (openssl rand -hex 32)");
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure configuration:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nSet real, unique values for these in your .env file.`
    );
  }
}

// SMTP is global server configuration (set once by whoever hosts
// GoodShare), not something each account configures — so it lives in env
// vars, not the database. Left undefined when unset: backup-email
// reminders simply can't be enabled until an admin sets these.
export const smtpConfig = process.env.SMTP_HOST
  ? {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "goodshare@localhost",
    }
  : null;

// Passkeys (WebAuthn) are bound to the domain the browser shows in its
// address bar while registering/signing in — that's the frontend, not the
// API host. Derived rather than a separate env var so it can't drift out
// of sync with FRONTEND_ORIGIN.
export const webauthnRpId = new URL(config.frontendOrigin).hostname;
export const webauthnOrigin = config.frontendOrigin;
