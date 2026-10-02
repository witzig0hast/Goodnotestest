import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isDev = process.env.NODE_ENV === "development";

// The backend API usually lives on a different origin/subdomain than this
// frontend (see docker-compose.yml) — the CSP has to explicitly allow
// talking to it (API calls) and loading from it (thumbnails, downloaded
// previews), or those would silently fail.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // CSP has no nonce mechanism for inline style="" attributes (only for
    // <style> blocks) — this codebase uses style={{...}} props throughout,
    // so 'unsafe-inline' is unavoidable here. script-src is what actually
    // matters for blocking injected/attacker-controlled scripts.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${apiOrigin}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${apiOrigin}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
