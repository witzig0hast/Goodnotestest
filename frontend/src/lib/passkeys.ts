import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  fetchPasskeyLoginOptions,
  fetchPasskeyRegistrationOptions,
  verifyPasskeyLogin,
  verifyPasskeyRegistration,
} from "./api";

export { browserSupportsWebAuthn };

export async function registerPasskey() {
  const options = await fetchPasskeyRegistrationOptions();
  const response = await startRegistration({ optionsJSON: options });
  return verifyPasskeyRegistration(response);
}

export async function loginWithPasskey() {
  const options = await fetchPasskeyLoginOptions();
  const response = await startAuthentication({ optionsJSON: options });
  return verifyPasskeyLogin(response);
}
