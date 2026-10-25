"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ApiError, createShareLink, fetchShareOptions } from "../lib/api";
import styles from "../app/ui.module.css";
import { translate, useT } from "../lib/i18n";

export function ShareForm({
  path,
  paths,
  onClose,
}: {
  path?: string;
  paths?: string[];
  onClose: () => void;
}) {
  const t = useT();
  const targetPaths = paths ?? (path ? [path] : []);
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifyOnOpen, setNotifyOnOpen] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState("");
  const [canNotify, setCanNotify] = useState(false);

  useEffect(() => {
    fetchShareOptions()
      .then((o) => setCanNotify(o.emailNotifications))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await createShareLink({
        paths: targetPaths,
        password: password.trim() || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        notifyOnOpen: canNotify && notifyOnOpen ? true : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
      });
      const url = `${window.location.origin}/s/${res.id}`;
      setLink(url);
      QRCode.toDataURL(url, { width: 160, margin: 1 })
        .then(setQrCodeUrl)
        .catch(() => {});
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : translate("Link konnte nicht erstellt werden.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — link is still visible to copy by hand
    }
  }

  return (
    <div className={styles.sharePanel}>
      {link ? (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {qrCodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not an optimizable remote image
              <img
                src={qrCodeUrl}
                alt={t("QR-Code für den Freigabe-Link")}
                width={120}
                height={120}
                style={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={styles.linkResult}>
                <span style={{ flex: 1 }}>{link}</span>
                <button
                  className={copied ? styles.copyButtonCopied : styles.copyButton}
                  onClick={copyLink}
                >
                  {copied ? t("Kopiert") : t("Kopieren")}
                </button>
              </div>
              <p className={styles.hint} style={{ marginTop: 8 }}>
                {t("QR-Code scannen, um den Link direkt auf einem Handy zu öffnen.")}
              </p>
            </div>
          </div>
          <button className={styles.smallButtonAccent} onClick={onClose} style={{ marginTop: 12, alignSelf: "flex-start" }}>
            {t("Fertig")}
          </button>
        </>
      ) : (
        <>
          {error && <div className={styles.errorBox}>{error}</div>}
          <div className={styles.sharePanelRow}>
            <div className={styles.field}>
              <label className={styles.label}>{t("Passwort (optional)")}</label>
              <input
                className={styles.input}
                type="text"
                placeholder={t("Kein Passwort")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t("Läuft ab nach (Tage, optional)")}</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={365}
                placeholder={t("Läuft nie ab")}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t("Max. Abrufe (optional)")}</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={10000}
                placeholder={t("Unbegrenzt")}
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
                style={{ width: 140 }}
              />
            </div>
          </div>
          {canNotify && (
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={notifyOnOpen}
                onChange={(e) => setNotifyOnOpen(e.target.checked)}
              />
              {t("Mich per E-Mail benachrichtigen, wenn jemand den Link öffnet")}
            </label>
          )}
          <div className={styles.actionRowInline}>
            <button className={styles.button} onClick={handleCreate} disabled={loading}>
              {loading ? t("Wird erstellt …") : t("Link erstellen")}
            </button>
            <button className={styles.smallButton} onClick={onClose}>
              {t("Abbrechen")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
