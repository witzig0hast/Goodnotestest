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
