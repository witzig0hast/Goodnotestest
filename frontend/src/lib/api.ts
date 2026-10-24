import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { translate } from "./i18n";

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
    // The server answers in German; show its message in the UI language.
    throw new ApiError(translate(body.error ?? "Etwas ist schiefgelaufen."));
  }

  return body as T;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface CreateRepositoryResponse {
  repositoryId: string;
  name: string;
  pin: string;
  webdav: {
    username: string;
    password: string;
  };
  approvalStatus: ApprovalStatus;
}

export function createRepository(input: { name: string; email: string; password: string }) {
  return request<CreateRepositoryResponse>("/api/repositories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// A plain full-page link, not a fetch() call: the browser needs to
// actually navigate to the backend so it can redirect on to the identity
// provider and back.
export const ssoStartUrl = `${API_BASE_URL}/api/auth/sso/start`;
export const ssoLinkStartUrl = `${API_BASE_URL}/api/auth/sso/link/start`;

export interface SsoStatus {
  enabled: boolean;
  providerName?: string;
}

export function fetchSsoStatus() {
  return request<SsoStatus>("/api/auth/sso/status");
}

export interface SessionResponse {
  repositoryId: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  webdavUsername: string;
  hasPassword: boolean;
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

// --- Account self-service: viewing WebDAV info again, regenerating
// credentials that can only ever be shown once, and account deletion ---

export function regenerateWebdavPassword() {
  return request<{ username: string; password: string }>("/api/repositories/webdav/regenerate", {
    method: "POST",
  });
}

export function regeneratePin() {
  return request<{ repositoryId: string; pin: string }>("/api/repositories/pin/regenerate", {
    method: "POST",
  });
}

export function deleteAccount(password?: string) {
  return request<void>("/api/repositories/me", {
    method: "DELETE",
    body: JSON.stringify(password ? { password } : {}),
  });
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

export function thumbnailUrl(path: string): string {
  return `${API_BASE_URL}/api/files/thumbnail?path=${encodeURIComponent(path)}`;
}

export function downloadZipMultiUrl(paths: string[]): string {
  const query = paths.map((p) => `paths=${encodeURIComponent(p)}`).join("&");
  return `${API_BASE_URL}/api/files/download-zip-multi?${query}`;
}

export function deleteEntry(path: string) {
  return request<void>("/api/files/delete", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function renameEntry(path: string, newName: string) {
  return request<{ path: string }>("/api/files/rename", {
    method: "POST",
    body: JSON.stringify({ path, newName }),
  });
}

export interface FileVersion {
  timestamp: string;
  size: number;
}

export function fetchVersions(path: string) {
  return request<{ versions: FileVersion[] }>(
    `/api/files/versions?path=${encodeURIComponent(path)}`
  );
}

export function versionDownloadUrl(path: string, timestamp: string): string {
  return `${API_BASE_URL}/api/files/versions/download?path=${encodeURIComponent(path)}&timestamp=${encodeURIComponent(timestamp)}`;
}

export function restoreVersion(path: string, timestamp: string) {
  return request<void>("/api/files/versions/restore", {
    method: "POST",
    body: JSON.stringify({ path, timestamp }),
  });
}

export interface RepositoryStats {
  totalFiles: number;
  totalSize: number;
  lastBackupAt: string | null;
  quotaBytes: number | null;
}

export function fetchStats() {
  return request<RepositoryStats>("/api/files/stats");
}

export interface SearchResult {
  path: string;
  name: string;
  matchedIn: "filename" | "content" | "handwriting";
  snippet?: string;
  page?: number;
}

export interface IndexStatus {
  enabled: boolean;
  pdfCount: number;
  indexed: number;
  ocrPages: number;
}

export function fetchIndexStatus() {
  return request<IndexStatus>("/api/files/index-status");
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
  paths: string[];
  password?: string;
  expiresInDays?: number;
  notifyOnOpen?: boolean;
  maxDownloads?: number;
}) {
  return request<CreateShareLinkResponse>("/api/share", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface MyShareLink {
  id: string;
  items: { relativePath: string; isDirectory: boolean }[];
  requiresPassword: boolean;
  expiresAt: string | null;
  expired: boolean;
  viewCount: number;
  createdAt: string;
  notifyOnOpen: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  exhausted: boolean;
}

export function fetchShareOptions() {
  return request<{ emailNotifications: boolean }>("/api/share/options");
}

export function fetchMyShareLinks() {
  return request<{ links: MyShareLink[] }>("/api/share/mine");
}

export function revokeShareLink(id: string) {
  return request<void>(`/api/share/${id}`, { method: "DELETE" });
}

export interface NextcloudStatus {
  connected: boolean;
  url: string | null;
  username: string | null;
  syncPath: string | null;
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

export function saveNextcloudSyncPath(syncPath: string) {
  return request<{ syncPath: string | null }>("/api/nextcloud/sync-path", {
    method: "POST",
    body: JSON.stringify({ syncPath }),
  });
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

// --- Backup-Benachrichtigungen (per E-Mail an die Konto-Adresse) ---

export interface NotificationSettings {
  enabled: boolean;
  notifyAfterDays: number | null;
  weeklyDigestEnabled: boolean;
}

export function fetchNotificationSettings() {
  return request<NotificationSettings>("/api/notifications");
}

export function saveNotificationSettings(input: { notifyAfterDays: number }) {
  return request<{ enabled: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function disableNotifications() {
  return request<void>("/api/notifications", { method: "DELETE" });
}

export function sendTestNotification() {
  return request<{ sent: true }>("/api/notifications/test", { method: "POST" });
}

export function setWeeklyDigest(enabled: boolean) {
  return request<{ enabled: boolean }>("/api/notifications/digest", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

// --- Public share page (no session cookie required) ---

export interface ShareInfo {
  name: string;
  type: "file" | "folder" | "bundle";
  items: { name: string; type: "file" | "folder" }[];
  requiresPassword: boolean;
  downloadsLeft: number | null;
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

// --- Admin: approving new accounts ---

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  usageBytes: number;
  quotaBytes: number | null;
  effectiveQuotaBytes: number | null;
  lastBackupAt: string | null;
}

export function fetchAdminUsers() {
  return request<{ users: AdminUser[]; defaultQuotaBytes: number | null }>("/api/admin/users");
}

export function setUserQuota(id: string, quotaMb: number | null) {
  return request<{ quotaBytes: number | null; effectiveQuotaBytes: number | null }>(
    `/api/admin/users/${id}/quota`,
    { method: "POST", body: JSON.stringify({ quotaMb }) }
  );
}

export function approveUser(id: string) {
  return request<{ approvalStatus: ApprovalStatus }>(`/api/admin/users/${id}/approve`, {
    method: "POST",
  });
}

export function rejectUser(id: string) {
  return request<{ approvalStatus: ApprovalStatus }>(`/api/admin/users/${id}/reject`, {
    method: "POST",
  });
}

// --- Site announcements (disclaimers/notices shown to everyone) ---

export interface Announcement {
  id: string;
  message: string;
  createdAt: string;
}

export function fetchAnnouncements() {
  return request<{ announcements: Announcement[] }>("/api/announcements");
}

export function fetchAdminAnnouncements() {
  return request<{ announcements: Announcement[] }>("/api/admin/announcements");
}

export function createAnnouncement(message: string) {
  return request<Announcement>("/api/admin/announcements", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function deleteAnnouncement(id: string) {
  return request<void>(`/api/admin/announcements/${id}`, { method: "DELETE" });
}

// --- Setup status: has GoodNotes connected yet? ---

export interface WebdavConnectionStatus {
  lastSuccessAt: string | null;
  lastError: "wrong_password" | "unknown_user" | "pending_approval" | "quota_exceeded" | null;
  lastErrorAt: string | null;
  fileCount: number;
  goodnotesFormatCount: number;
}

export function fetchWebdavStatus() {
  return request<WebdavConnectionStatus>("/api/repositories/webdav/status");
}

// --- Trash ---

export interface TrashItem {
  id: string;
  originalPath: string;
  name: string;
  isDirectory: boolean;
  size: number;
  deletedBy: "web" | "goodnotes";
  deletedAt: string;
  expiresAt: string;
}

export function fetchTrash() {
  return request<{ items: TrashItem[]; retentionDays: number }>("/api/trash");
}

export function restoreTrashItem(id: string) {
  return request<{ path: string }>(`/api/trash/${id}/restore`, { method: "POST" });
}

export function deleteTrashItem(id: string) {
  return request<void>(`/api/trash/${id}`, { method: "DELETE" });
}

export function emptyTrash() {
  return request<{ deleted: number }>("/api/trash", { method: "DELETE" });
}

// --- Activity: audit log + backup calendar ---

export interface AuditEntry {
  id: number;
  repositoryId: string | null;
  repositoryName?: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export function fetchActivityLog() {
  return request<{ entries: AuditEntry[] }>("/api/activity/log");
}

export function fetchAdminAudit() {
  return request<{ entries: AuditEntry[] }>("/api/admin/audit");
}

export interface BackupDay {
  day: string;
  uploads: number;
  lastUploadAt: string;
}

export function fetchBackupDays(days = 182) {
  return request<{ days: BackupDay[] }>(`/api/activity/backups?days=${days}`);
}

// --- Upload links: others can drop files into one of your folders ---

export function createUploadLink(input: {
  path: string;
  label?: string;
  password?: string;
  expiresInDays?: number;
  maxFiles?: number;
  notifyOwner?: boolean;
}) {
  return request<{ id: string }>("/api/upload-links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface MyUploadLink {
  id: string;
  relativePath: string;
  label: string | null;
  requiresPassword: boolean;
  expiresAt: string | null;
  expired: boolean;
  maxFiles: number | null;
  uploadCount: number;
  full: boolean;
  createdAt: string;
}

export function fetchMyUploadLinks() {
  return request<{ links: MyUploadLink[] }>("/api/upload-links/mine");
}

export function revokeUploadLink(id: string) {
  return request<void>(`/api/upload-links/${id}`, { method: "DELETE" });
}

export interface UploadLinkInfo {
  label: string | null;
  ownerName: string;
  folderName: string;
  requiresPassword: boolean;
  filesLeft: number | null;
  maxFileMb: number;
  allowedExtensions: string[];
}

export function fetchUploadLinkInfo(id: string) {
  return request<UploadLinkInfo>(`/api/upload-links/${id}`);
}

export function unlockUploadLink(id: string, password: string) {
  return request<{ token: string }>(`/api/upload-links/${id}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/**
 * Uploads one file via XMLHttpRequest rather than fetch(), because only
 * XHR reports upload progress — the upload page shows a bar per file.
 */
export function uploadViaLink(
  id: string,
  file: File,
  token: string | null,
  onProgress: (fraction: number) => void
): Promise<{ name: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
    xhr.open("POST", `${API_BASE_URL}/api/upload-links/${id}/files${suffix}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { name?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page (e.g. a proxy's 413)
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ name: body.name ?? file.name });
      else if (xhr.status === 413) reject(new ApiError(translate("Die Datei ist zu groß.")));
      else reject(new ApiError(translate(body.error ?? "Hochladen ist fehlgeschlagen.")));
    };
    xhr.onerror = () => reject(new ApiError(translate("Keine Verbindung zum Server.")));
    xhr.send(file);
  });
}

// --- Tags ---

export const TAG_COLORS = ["green", "blue", "purple", "pink", "red", "orange", "yellow", "gray"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
}

export function fetchTags() {
  return request<{ tags: Tag[]; assignments: Record<string, string[]> }>("/api/tags");
}

export function createTag(name: string, color: TagColor) {
  return request<Tag>("/api/tags", { method: "POST", body: JSON.stringify({ name, color }) });
}

export function deleteTag(id: string) {
  return request<void>(`/api/tags/${id}`, { method: "DELETE" });
}

export function assignTag(id: string, path: string) {
  return request<void>(`/api/tags/${id}/assign`, { method: "POST", body: JSON.stringify({ path }) });
}

export function unassignTag(id: string, path: string) {
  return request<void>(`/api/tags/${id}/assign`, { method: "DELETE", body: JSON.stringify({ path }) });
}
