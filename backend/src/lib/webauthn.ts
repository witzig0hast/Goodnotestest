import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { webauthnOrigin, webauthnRpId } from "./config.js";
import { ensureWebauthnUserHandle, type RepositoryRecord } from "./repositories.js";
import { listCredentialsForRepository } from "./webauthn-credentials.js";

const RP_NAME = "GoodShare";

export async function buildRegistrationOptions(repo: RepositoryRecord) {
  const userHandle = ensureWebauthnUserHandle(repo);
  const existingCredentials = listCredentialsForRepository(repo.id);

  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: webauthnRpId,
    userID: new Uint8Array(Buffer.from(userHandle, "base64url")),
    userName: repo.email ?? repo.id,
    userDisplayName: repo.name,
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      transports: cred.transports as AuthenticatorTransport[],
    })),
    // "required" makes the passkey discoverable (resident key), so people
    // can sign in by picking it from their device without typing anything.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: webauthnOrigin,
    expectedRPID: webauthnRpId,
  });
}

export async function buildAuthenticationOptions() {
  // No allowCredentials: the browser/OS shows every discoverable passkey
  // registered for this site and lets the person pick — no need to know
  // who they are before the ceremony starts.
  return generateAuthenticationOptions({
    rpID: webauthnRpId,
    userVerification: "preferred",
  });
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: { id: string; publicKey: Buffer; counter: number; transports?: string[] }
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: webauthnOrigin,
    expectedRPID: webauthnRpId,
    // Buffer's stricter generic ArrayBuffer typing doesn't structurally
    // match the library's Uint8Array<ArrayBuffer> type, though the actual
    // bytes are exactly what it expects.
    credential: credential as unknown as Parameters<
      typeof verifyAuthenticationResponse
    >[0]["credential"],
  });
}
