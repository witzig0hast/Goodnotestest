import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(body.error ?? "Etwas ist schiefgelaufen.");
  }

  return body as T;
}

export interface CreateRepositoryResponse {
  repositoryId: string;
  name: string;
  pin: string;
  webdav: {
    username: string;
    password: string;
  };
}

export function createRepository(input: { name: string; email: string; password: string }) {
  return request<CreateRepositoryResponse>("/api/repositories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface SessionResponse {
  repositoryId: string;
  name: string;
  email: string | null;
}

export function loginWithPassword(email: string, password: string) {
  return request<SessionResponse>("/api/auth/login-password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithCode(repositoryId: string, pin: string) {
  return request<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ repositoryId, pin }),
  });
}

export function fetchCurrentRepository() {
  return request<SessionResponse>("/api/auth/me");
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

// --- Passkeys ---

export function fetchPasskeyRegistrationOptions() {
  return request<PublicKeyCredentialCreationOptionsJSON>(
    "/api/auth/webauthn/registration-options"
  );
}

export function verifyPasskeyRegistration(response: RegistrationResponseJSON) {
  return request<{ verified: boolean }>("/api/auth/webauthn/registration-verify", {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}

export function fetchPasskeyCount() {
  return request<{ count: number }>("/api/auth/webauthn/credentials");
}

export function fetchPasskeyLoginOptions() {
  return request<PublicKeyCredentialRequestOptionsJSON>("/api/auth/webauthn/login-options");
}

export function verifyPasskeyLogin(response: AuthenticationResponseJSON) {
  return request<SessionResponse>("/api/auth/webauthn/login-verify", {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  modifiedAt?: string;
  children?: TreeNode[];
}

export function fetchTree() {
  return request<{ tree: TreeNode[] }>("/api/files/tree");
}

export function downloadFileUrl(path: string): string {
  return `${API_BASE_URL}/api/files/download?path=${encodeURIComponent(path)}`;
}

export function downloadZipUrl(path: string): string {
  return `${API_BASE_URL}/api/files/download-zip?path=${encodeURIComponent(path)}`;
}

export function downloadPdfUrl(path: string): string {
  return `${API_BASE_URL}/api/files/download-pdf?path=${encodeURIComponent(path)}`;
}

export function previewFileUrl(path: string): string {
  return downloadFileUrl(path);
}

export interface SearchResult {
  path: string;
  name: string;
  matchedIn: "filename" | "content";
  snippet?: string;
}

export function searchFiles(query: string) {
  return request<{ results: SearchResult[] }>(
    `/api/files/search?q=${encodeURIComponent(query)}`
  );
}

export function fetchFavorites() {
  return request<{ paths: string[] }>("/api/files/favorites");
}

export function addFavorite(path: string) {
  return request<void>("/api/files/favorites", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function removeFavorite(path: string) {
  return request<void>("/api/files/favorites", {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export interface CreateShareLinkResponse {
  id: string;
}

export function createShareLink(input: {
  path: string;
  password?: string;
  expiresInDays?: number;
}) {
  return request<CreateShareLinkResponse>("/api/share", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface NextcloudStatus {
  connected: boolean;
  url: string | null;
  username: string | null;
}

export function fetchNextcloudStatus() {
  return request<NextcloudStatus>("/api/nextcloud");
}

export function connectNextcloud(input: {
  url: string;
  username: string;
  password: string;
}) {
  return request<{ connected: true }>("/api/nextcloud", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function disconnectNextcloud() {
  return request<void>("/api/nextcloud", { method: "DELETE" });
}

export interface NextcloudSyncResult {
  uploaded: number;
  failed: number;
}

export function syncNextcloud() {
  return request<NextcloudSyncResult>("/api/nextcloud/sync", { method: "POST" });
}

export interface NextcloudPullResult {
  downloaded: number;
  failed: number;
}

export function pullFromNextcloud() {
  return request<NextcloudPullResult>("/api/nextcloud/pull", { method: "POST" });
}

// --- Backup-Benachrichtigungen (ntfy) ---

export interface NotificationSettings {
  enabled: boolean;
  ntfyUrl: string | null;
  ntfyTopic: string | null;
  notifyAfterDays: number | null;
}

export function fetchNotificationSettings() {
  return request<NotificationSettings>("/api/notifications");
}

export function saveNotificationSettings(input: {
  ntfyUrl: string;
  ntfyTopic: string;
  notifyAfterDays: number;
}) {
  return request<{ enabled: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function disableNotifications() {
  return request<void>("/api/notifications", { method: "DELETE" });
}

export function sendTestNotification(input: {
  ntfyUrl: string;
  ntfyTopic: string;
  notifyAfterDays: number;
}) {
  return request<{ sent: true }>("/api/notifications/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Public share page (no session cookie required) ---

export interface ShareInfo {
  name: string;
  type: "file" | "folder";
  requiresPassword: boolean;
}

export function fetchShareInfo(id: string) {
  return request<ShareInfo>(`/api/share/${id}`);
}

export function unlockShareLink(id: string, password: string) {
  return request<{ token: string }>(`/api/share/${id}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function shareDownloadUrl(id: string, token?: string): string {
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_BASE_URL}/api/share/${id}/download${suffix}`;
}
