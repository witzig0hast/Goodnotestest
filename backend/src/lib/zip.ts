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
