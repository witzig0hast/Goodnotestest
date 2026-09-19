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
  jwtSecret: required("JWT_SECRET", "dev-only-secret-change-me"),
  frontendOrigin: required("FRONTEND_ORIGIN", "http://localhost:3000"),
};
