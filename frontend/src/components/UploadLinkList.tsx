"use client";

import { useEffect, useState } from "react";
import { ApiError, fetchMyUploadLinks, revokeUploadLink, type MyUploadLink } from "../lib/api";
import { formatDate } from "../lib/format";
import { LoadingState } from "./LoadingState";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";

export function UploadLinkList() {
  const t = useT();
  const [links, setLinks] = useState<MyUploadLink[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchMyUploadLinks()
      .then((res) => setLinks(res.links))
      .catch(() => setLinks([]));
  }, []);

  async function handleRevoke(id: string) {
    if (!window.confirm(t("Diesen Upload-Link widerrufen? Danach kann niemand mehr darüber hochladen."))) return;
    setBusyId(id);
    try {
      await revokeUploadLink(id);
      setLinks((l) => l?.filter((x) => x.id !== id) ?? null);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : t("Widerrufen ist fehlgeschlagen."));
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
        {t("Noch keine Upload-Links. Erstelle einen über „⋯“ an einem Ordner → „Upload-Link erstellen“.")}
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
              {link.label ?? t("In „{folder}“", { folder: link.relativePath || t("Meine Notizen") })}
            </span>
            <span className={styles.fileMeta}>
              📁 {link.relativePath || t("Meine Notizen")} ·{" "}
              {link.maxFiles !== null
                ? link.uploadCount === 1
                  ? t("{n} von {max} Datei erhalten", { n: link.uploadCount, max: link.maxFiles })
                  : t("{n} von {max} Dateien erhalten", { n: link.uploadCount, max: link.maxFiles })
                : link.uploadCount === 1
                  ? t("{n} Datei erhalten", { n: link.uploadCount })
                  : t("{n} Dateien erhalten", { n: link.uploadCount })}{" "}
              ·{" "}
              {link.requiresPassword ? `${t("Passwortgeschützt")} · ` : ""}
              {link.expired
                ? t("Abgelaufen")
                : link.full
                  ? t("Voll")
                  : link.expiresAt
                    ? t("gültig bis {date}", { date: formatDate(link.expiresAt) })
                    : t("unbegrenzt gültig")}
            </span>
          </div>
          <div className={styles.fileActions}>
            <button className={styles.smallButton} onClick={() => copy(link.id)}>
              {copiedId === link.id ? t("Kopiert") : t("Link kopieren")}
            </button>
            <button className={styles.smallButton} onClick={() => handleRevoke(link.id)} disabled={busyId === link.id}>
              {t("Widerrufen")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
