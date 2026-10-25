import { copyFileSync, existsSync, mkdirSync, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { createWorker, type Worker } from "tesseract.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { buildRepositoryTree, flattenFiles } from "./file-tree.js";
import { resolveSafePath } from "./storage.js";

/**
 * Per-page text index for search, including text recognition (OCR) for
 * pages that have no text layer — handwritten pages exported by GoodNotes
 * and scanned documents. Each page's text is stored with where it came
 * from ("text" = the PDF's own text layer, "ocr" = recognized), so search
 * can jump straight to the page and say "found in your handwriting".
 *
 * Indexing runs in the background, one file at a time: a periodic sweep
 * finds PDFs whose current version (by mtime) isn't indexed yet. That
 * catches every way a file can arrive (WebDAV, upload links, Shortcut,
 * restores) without hooking each of them.
 */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_OCR_PAGES_PER_FILE = 300;
// Pages whose text layer has fewer characters than this get OCR'd.
const MIN_TEXT_LAYER_CHARS = 25;
const OCR_RENDER_WIDTH = 1600;
const SWEEP_INTERVAL_MS = 60 * 1000;
const WORKER_IDLE_MS = 5 * 60 * 1000;
const LANGUAGES = ["deu", "eng"];

export interface PageText {
  page: number;
  text: string;
  source: "text" | "ocr";
}

// --- Tesseract worker (lazy, shut down when idle to free ~100 MB RAM) ---

let worker: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Copies the bundled traineddata files into one directory tesseract.js can read from. */
function prepareLanguageData(): string {
  const dir = path.resolve(config.ocrDataDir, "lang");
  mkdirSync(dir, { recursive: true });
  const require = createRequire(import.meta.url);
  for (const lang of LANGUAGES) {
    const target = path.join(dir, `${lang}.traineddata.gz`);
    if (existsSync(target)) continue;
    const pkg = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    copyFileSync(path.join(pkg, "4.0.0_best_int", `${lang}.traineddata.gz`), target);
  }
  return dir;
}

function getWorker(): Promise<Worker> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const w = worker;
    worker = null;
    w?.then((x) => x.terminate()).catch(() => {});
  }, WORKER_IDLE_MS);
  if (!worker) {
    const langPath = prepareLanguageData();
    worker = createWorker(LANGUAGES.join("+"), 1, {
      langPath,
      cachePath: path.resolve(config.ocrDataDir, "cache"),
      gzip: true,
    }).catch((err) => {
      worker = null;
      throw err;
    });
  }
  return worker;
}

async function recognize(png: Uint8Array): Promise<string> {
  const w = await getWorker();
  const result = await w.recognize(Buffer.from(png));
  // Tesseract emits stray single characters for ruled lines and doodles;
  // keep only lines with at least one 2-letter word.
  return result.data.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\p{L}{2,}/u.test(l))
    .join("\n");
}

// --- Extraction ---

export async function extractPages(buffer: Buffer, ocr = config.ocrEnabled): Promise<PageText[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    const pages: PageText[] = textResult.pages.map((p) => ({
      page: p.num,
      text: p.text.trim(),
      source: "text" as const,
    }));
    if (!ocr) return pages;

    const needOcr = pages
      .filter((p) => p.text.replace(/\s+/g, "").length < MIN_TEXT_LAYER_CHARS)
      .slice(0, MAX_OCR_PAGES_PER_FILE);
    for (const page of needOcr) {
      const shot = await parser.getScreenshot({
        partial: [page.page],
        desiredWidth: OCR_RENDER_WIDTH,
        imageBuffer: true,
        imageDataUrl: false,
      });
      const image = shot.pages[0]?.data;
      if (!image) continue;
      const recognized = await recognize(image).catch(() => "");
      if (recognized.length > page.text.length) {
        page.text = recognized;
        page.source = "ocr";
      }
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

// --- Index bookkeeping ---

function indexedMtime(repositoryId: string, relativePath: string): string | null {
  const row = db
    .prepare("SELECT mtime FROM file_page_text WHERE repository_id = ? AND relative_path = ? LIMIT 1")
    .get(repositoryId, relativePath) as { mtime: string } | undefined;
  return row?.mtime ?? null;
}

function storePages(repositoryId: string, relativePath: string, mtime: string, pages: PageText[]): void {
  const write = db.transaction(() => {
    db.prepare("DELETE FROM file_page_text WHERE repository_id = ? AND relative_path = ?").run(
      repositoryId,
      relativePath
    );
    const insert = db.prepare(
      `INSERT INTO file_page_text (repository_id, relative_path, mtime, page, text, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    // A page-0 marker records "indexed, nothing found" so the file isn't retried every sweep.
    if (pages.length === 0) insert.run(repositoryId, relativePath, mtime, 0, "", "text");
    for (const p of pages) insert.run(repositoryId, relativePath, mtime, p.page, p.text, p.source);
  });
  write();
}

export async function indexFile(repositoryId: string, relativePath: string): Promise<void> {
  const absolutePath = resolveSafePath(repositoryId, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) return;
  const mtime = stat.mtime.toISOString();
  if (indexedMtime(repositoryId, relativePath) === mtime) return;
  if (stat.size > MAX_FILE_BYTES) {
    storePages(repositoryId, relativePath, mtime, []);
    return;
  }
  let pages: PageText[] = [];
  try {
    pages = await extractPages(await fs.readFile(absolutePath));
  } catch {
    // unreadable / encrypted PDF: remember it as indexed-without-text
  }
  storePages(repositoryId, relativePath, mtime, pages);
}

export function getIndexedPages(repositoryId: string, relativePath: string, mtime: string): PageText[] | null {
  const rows = db
    .prepare(
      "SELECT page, text, source, mtime FROM file_page_text WHERE repository_id = ? AND relative_path = ? ORDER BY page"
    )
    .all(repositoryId, relativePath) as (PageText & { mtime: string })[];
  if (rows.length === 0 || rows[0].mtime !== mtime) return null;
  return rows.filter((r) => r.page > 0).map(({ page, text, source }) => ({ page, text, source }));
}

// --- Background queue ---

const queue: { repositoryId: string; relativePath: string }[] = [];
const queued = new Set<string>();
let running = false;

function key(repositoryId: string, relativePath: string) {
  return `${repositoryId}\u0000${relativePath}`;
}

export function enqueue(repositoryId: string, relativePath: string): void {
  const k = key(repositoryId, relativePath);
  if (queued.has(k)) return;
  queued.add(k);
  queue.push({ repositoryId, relativePath });
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        await indexFile(job.repositoryId, job.relativePath);
      } catch {
        // skip, retried on the next sweep if still unindexed
      } finally {
        queued.delete(key(job.repositoryId, job.relativePath));
      }
    }
  } finally {
    running = false;
  }
}

export function pendingCount(repositoryId: string): number {
  let n = 0;
  for (const job of queue) if (job.repositoryId === repositoryId) n++;
  return n;
}

/** Queues every PDF of the account whose current version isn't indexed yet. */
export async function sweepRepository(repositoryId: string): Promise<number> {
  const files = flattenFiles(await buildRepositoryTree(repositoryId)).filter((f) =>
    f.name.toLowerCase().endsWith(".pdf")
  );
  let added = 0;
  for (const f of files) {
    if (indexedMtime(repositoryId, f.path) !== f.modifiedAt) {
      enqueue(repositoryId, f.path);
      added++;
    }
  }
  return added;
}

export function startOcrSweeps(): void {
  const sweepAll = async () => {
    const repos = db.prepare("SELECT id FROM repositories WHERE approval_status = 'approved'").all() as {
      id: string;
    }[];
    for (const r of repos) await sweepRepository(r.id).catch(() => {});
  };
  setTimeout(() => void sweepAll(), 20 * 1000);
  setInterval(() => void sweepAll(), SWEEP_INTERVAL_MS);
}

export async function indexStatus(repositoryId: string) {
  const files = flattenFiles(await buildRepositoryTree(repositoryId)).filter((f) =>
    f.name.toLowerCase().endsWith(".pdf")
  );
  let indexed = 0;
  for (const f of files) if (indexedMtime(repositoryId, f.path) === f.modifiedAt) indexed++;
  const ocrPages = (
    db
      .prepare("SELECT COUNT(*) AS n FROM file_page_text WHERE repository_id = ? AND source = 'ocr'")
      .get(repositoryId) as { n: number }
  ).n;
  return { enabled: config.ocrEnabled, pdfCount: files.length, indexed, ocrPages };
}
