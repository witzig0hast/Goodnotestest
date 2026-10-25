"use client";

import { useState } from "react";
import { downloadFileUrl } from "../lib/api";
import { offlineFiles } from "../lib/offline";
import { PageHeader } from "./PageHeader";
import { PdfViewer } from "./PdfViewer";
import styles from "../app/ui.module.css";
import { useT } from "../lib/i18n";

// Shown instead of the dashboard when the server can't be reached but
// offline favorites are switched on: lists what's stored on this device.
export function OfflineView() {
  const t = useT();
  const [files] = useState(offlineFiles);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className={styles.shellWide}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.connectionBox} style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 20 }}>📴</span>
            <div style={{ flex: 1 }}>
              <strong>{t("Du bist offline.")}</strong>
              <div className={styles.connectionNote}>
                {t("Hier sind deine Favoriten, die auf diesem Gerät gespeichert sind. Sobald du wieder Internet hast, ist alles andere zurück.")}
              </div>
            </div>
            <button className={styles.smallButton} onClick={() => window.location.reload()}>
              {t("Erneut versuchen")}
            </button>
          </div>
          {files.length === 0 ? (
            <div className={styles.emptyState}>{t("Keine Notizen offline gespeichert.")}</div>
          ) : (
            <div className={styles.fileList}>
              {files.map((f) => (
                <div key={f.path} className={styles.fileRow}>
                  <div className={styles.fileIcon}>📄</div>
                  <div className={styles.fileMainClickable} onClick={() => setOpen(f.path)}>
                    <span className={styles.fileNameText}>{f.name.replace(/\.pdf$/i, "")}</span>
                    <span className={styles.fileMeta}>{f.path}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      {open && (
        <PdfViewer url={downloadFileUrl(open)} title={open.split("/").pop() ?? open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
