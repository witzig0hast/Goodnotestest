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

export function createRepository(name: string) {
  return request<CreateRepositoryResponse>("/api/repositories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export interface SessionResponse {
  repositoryId: string;
  name: string;
}

export function login(repositoryId: string, pin: string) {
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
