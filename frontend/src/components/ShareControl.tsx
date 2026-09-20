"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { ApiError, createShareLink } from "../lib/api";
import styles from "../app/ui.module.css";

export function ShareForm({ path, onClose }: { path: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await createShareLink({
        path,
        password: password.trim() || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      const url = `${window.location.origin}/s/${res.id}`;
      setLink(url);
      QRCode.toDataURL(url, { width: 160, margin: 1 })
        .then(setQrCodeUrl)
        .catch(() => {});
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Link konnte nicht erstellt werden."
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
                alt="QR-Code für den Freigabe-Link"
                width={120}
                height={120}
                style={{ borderRadius: 8, border: "1px solid var(--border)" }}
              />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={styles.linkResult}>
                <span style={{ flex: 1 }}>{link}</span>
                <button className={styles.copyButton} onClick={copyLink}>
                  {copied ? "Kopiert" : "Kopieren"}
                </button>
              </div>
              <p className={styles.hint} style={{ marginTop: 8 }}>
                QR-Code scannen, um den Link direkt auf einem Handy zu öffnen.
              </p>
            </div>
          </div>
          <button className={styles.smallButton} onClick={onClose} style={{ marginTop: 12 }}>
            Fertig
          </button>
        </>
      ) : (
        <>
          {error && <div className={styles.errorBox}>{error}</div>}
          <div className={styles.sharePanelRow}>
            <div className={styles.field}>
              <label className={styles.label}>Passwort (optional)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Kein Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Läuft ab nach (Tage, optional)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={365}
                placeholder="Läuft nie ab"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                style={{ width: 160 }}
              />
            </div>
          </div>
          <div className={styles.actionRowInline}>
            <button className={styles.button} onClick={handleCreate} disabled={loading}>
              {loading ? "Wird erstellt …" : "Link erstellen"}
            </button>
            <button className={styles.smallButton} onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
