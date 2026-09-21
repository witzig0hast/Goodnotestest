import { statSync } from "node:fs";
import { ZipArchive } from "archiver";
import type { Response } from "express";

export function streamDirectoryAsZip(
  res: Response,
  absoluteDir: string,
  topLevelFolderName: string,
  downloadFilename: string
) {
  res.attachment(downloadFilename);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", () => {
    if (!res.headersSent) res.status(500);
    res.end();
  });

  archive.pipe(res);
  archive.directory(absoluteDir, topLevelFolderName);
  archive.finalize();
}

/**
 * Zips an arbitrary set of files/folders together, each kept at its own
 * relative path inside the archive (so a multi-select download still
 * reads like the original folder structure once unzipped).
 */
export function streamPathsAsZip(
  res: Response,
  entries: { absolutePath: string; relativePath: string }[],
  downloadFilename: string
) {
  res.attachment(downloadFilename);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", () => {
    if (!res.headersSent) res.status(500);
    res.end();
  });

  archive.pipe(res);
  for (const entry of entries) {
    if (statSync(entry.absolutePath).isDirectory()) {
      archive.directory(entry.absolutePath, entry.relativePath);
    } else {
      archive.file(entry.absolutePath, { name: entry.relativePath });
    }
  }
  archive.finalize();
}
