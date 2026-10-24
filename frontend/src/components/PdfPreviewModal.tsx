"use client";

import { downloadFileUrl, previewFileUrl } from "../lib/api";
import { PdfViewer } from "./PdfViewer";

// The previous version embedded the PDF with <object>, which never worked:
// the page's CSP has object-src 'none', the API serves files as
// attachments, and iOS Safari only shows page one of embedded PDFs anyway.
// pdf.js draws the pages itself, so none of that applies.
export function PdfPreviewModal({
  path,
  initialPage,
  onClose,
}: {
  path: string;
  initialPage?: number;
  onClose: () => void;
}) {
  return (
    <PdfViewer
      url={previewFileUrl(path)}
      title={path.split("/").pop() ?? path}
      downloadUrl={downloadFileUrl(path)}
      initialPage={initialPage}
      onClose={onClose}
    />
  );
}
