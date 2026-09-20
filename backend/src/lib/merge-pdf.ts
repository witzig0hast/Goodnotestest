import { promises as fs } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildTreeAt, flattenFiles } from "./file-tree.js";
import { resolveSafePath } from "./storage.js";

/**
 * Merges every PDF under a folder (recursively, in the same order they're
 * shown in the file browser) into a single PDF. Files that aren't PDFs, or
 * that turn out to be encrypted/corrupted, are silently skipped rather than
 * failing the whole merge — one bad file shouldn't block the rest.
 */
export async function mergeFolderToPdf(
  repositoryId: string,
  relativeFolderPath: string
): Promise<Uint8Array> {
  const absoluteDir = resolveSafePath(repositoryId, relativeFolderPath);
  const tree = await buildTreeAt(absoluteDir, relativeFolderPath);
  const pdfFiles = flattenFiles(tree).filter((node) =>
    node.name.toLowerCase().endsWith(".pdf")
  );

  const merged = await PDFDocument.create();

  for (const file of pdfFiles) {
    try {
      const bytes = await fs.readFile(resolveSafePath(repositoryId, file.path));
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch {
      // skip this file, keep going
    }
  }

  return merged.save();
}
