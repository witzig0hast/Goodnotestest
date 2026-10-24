"use client";

import { useEffect, useState } from "react";
import { ApiError, fetchMyUploadLinks, revokeUploadLink, type MyUploadLink } from "../lib/api";
import { formatDate } from "../lib/format";
import { LoadingState } from "./LoadingState";
import styles from "../app/ui.module.css";

export function UploadLinkList() {
  const [links, setLinks] = useState<MyUploadLink[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchMyUploadLinks()
      .then((res) => setLinks(res.links))
      .catch(() => setLinks([]));
  }, []);

  async function handleRevoke(id: string) {
    if (!window.confirm("Diesen Upload-Link widerrufen? Danach kann niemand mehr darüber hochladen.")) return;
    setBusyId(id);
    try {
      await revokeUploadLink(id);
      setLinks((l) => l?.filter((x) => x.id !== id) ?? null);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Widerrufen ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  if (!links) return <LoadingState />;
  if (links.length === 0) {
    return (
      <div className={styles.emptyState}>
        Noch keine Upload-Links. Erstelle einen über „⋯“ an einem Ordner → „Upload-Link erstellen“.
      </div>
    );
  }

  return (
    <div className={styles.fileList}>
      {links.map((link) => (
        <div key={link.id} className={styles.fileRow}>
          <div className={styles.fileIcon}>📥</div>
          <div className={styles.fileMain}>
            <span className={styles.fileNameText}>
              {link.label ?? `In „${link.relativePath || "Meine Notizen"}“`}
            </span>
            <span className={styles.fileMeta}>
              📁 {link.relativePath || "Meine Notizen"} · {link.uploadCount}
              {link.maxFiles !== null ? ` von ${link.maxFiles}` : ""}{" "}
              {link.uploadCount === 1 ? "Datei" : "Dateien"} erhalten ·{" "}
              {link.requiresPassword ? "Passwortgeschützt · " : ""}
              {link.expired
                ? "Abgelaufen"
                : link.full
                  ? "Voll"
                  : link.expiresAt
                    ? `gültig bis ${formatDate(link.expiresAt)}`
                    : "unbegrenzt gültig"}
            </span>
          </div>
          <div className={styles.fileActions}>
            <button className={styles.smallButton} onClick={() => copy(link.id)}>
              {copiedId === link.id ? "Kopiert" : "Link kopieren"}
            </button>
            <button className={styles.smallButton} onClick={() => handleRevoke(link.id)} disabled={busyId === link.id}>
              Widerrufen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
