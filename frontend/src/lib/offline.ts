import { downloadFileUrl } from "./api";

/**
 * "Favoriten offline verfügbar": the service worker (public/sw.js) keeps
 * copies of the favorite PDFs and of the dashboard itself, so favorites
 * can be read without a connection — e.g. on the iPad in the lecture hall.
 * Off by default; the list of what's stored lives in localStorage so the
 * offline view can show names without asking the server.
 */

const ENABLED_KEY = "goodshare.offlineEnabled";
const LIST_KEY = "goodshare.offlineFavorites";

export interface OfflineFile {
  path: string;
  name: string;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: offline mode just won't remember its list
  }
}

export function offlineSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "caches" in window;
}

export function isOfflineEnabled(): boolean {
  return safeGet(ENABLED_KEY) === "1";
}

export function offlineFiles(): OfflineFile[] {
  try {
    return JSON.parse(safeGet(LIST_KEY) ?? "[]") as OfflineFile[];
  } catch {
    return [];
  }
}

async function postToWorker(message: object, expectReply: string): Promise<{ stored?: number }> {
  const registration = await navigator.serviceWorker.ready;
  const target = registration.active;
  if (!target) throw new Error("Kein Service Worker aktiv.");
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === expectReply) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    target.postMessage(message);
    // Don't hang forever if the worker was replaced meanwhile.
    setTimeout(() => resolve({}), 60_000);
  });
}

/** Scripts/styles the current page loaded, plus the PDF viewer's own files. */
async function currentAssets(): Promise<string[]> {
  // Load the viewer's code now, so it's part of what gets stored.
  await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => {});
  const loaded = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => {
      try {
        const url = new URL(u);
        return url.origin === window.location.origin && url.pathname.startsWith("/_next/static/");
      } catch {
        return false;
      }
    });
  return Array.from(new Set([...loaded, "/pdfjs/pdf.worker.min.mjs", "/icons/icon-192.png"]));
}

/** Stores the given favorites (PDFs only) for offline use; returns how many were stored. */
export async function syncOfflineFavorites(files: OfflineFile[]): Promise<number> {
  const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  safeSet(ENABLED_KEY, "1");
  safeSet(LIST_KEY, JSON.stringify(pdfs));
  const reply = await postToWorker(
    {
      type: "offline-sync",
      urls: pdfs.map((f) => downloadFileUrl(f.path)),
      assets: await currentAssets(),
    },
    "offline-synced"
  );
  return reply.stored ?? 0;
}

/** Switches offline mode off and deletes every stored copy. */
export async function clearOffline(): Promise<void> {
  const wasEnabled = isOfflineEnabled();
  safeSet(ENABLED_KEY, null);
  safeSet(LIST_KEY, null);
  if (!offlineSupported()) return;
  if (wasEnabled) {
    // Bounded wait: logging out must never hang on a missing worker.
    await Promise.race([
      postToWorker({ type: "offline-clear" }, "offline-cleared").catch(() => {}),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }
  // Belt and braces: the page can delete the caches itself too.
  await Promise.all(
    ["goodshare-offline-files-v1", "goodshare-offline-shell-v1"].map((name) =>
      caches.delete(name).catch(() => false)
    )
  );
}
