import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: required("DATABASE_PATH", "./data/goodshare.sqlite"),
  filesDir: required("FILES_DIR", "./data/files"),
  jwtSecret: required("JWT_SECRET", "dev-only-secret-change-me"),
  encryptionKey: required(
    "ENCRYPTION_KEY",
    "2132b2fd14c842b81a841014895dc9505a58f32c54b54b4dd1d5454ea929787f"
  ),
  frontendOrigin: required("FRONTEND_ORIGIN", "http://localhost:3000"),
};

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
