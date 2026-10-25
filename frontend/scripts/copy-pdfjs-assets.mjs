// Copies pdf.js' web worker and its font/cmap/wasm data into public/pdfjs,
// so the PDF viewer loads them from this site's own origin. The page's CSP
// only allows workers and fetches from 'self' (plus the API), and pinning
// the files to the installed pdfjs-dist version keeps worker and library
// in lockstep — pdf.js refuses to run with a mismatched worker.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pdfjs");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(pdfjsRoot, "legacy", "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
for (const dir of ["standard_fonts", "cmaps", "wasm"]) {
  cpSync(join(pdfjsRoot, dir), join(target, dir), { recursive: true });
}
console.log(`pdf.js assets copied to ${target}`);
