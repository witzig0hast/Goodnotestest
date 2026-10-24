"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ApiError, createUploadLink, fetchShareOptions } from "../lib/api";
import styles from "../app/ui.module.css";

// Creates an upload link for one folder: others can send files into it
// (without seeing what's already there). Same look as the share form.
export function UploadLinkForm({ path, onClose }: { path: string; onClose: () => void }) {
  const folderName = path ? path.split("/").pop() : "Meine Notizen";
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [maxFiles, setMaxFiles] = useState("");
  const [notify, setNotify] = useState(true);
  const [canNotify, setCanNotify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchShareOptions()
      .then((o) => setCanNotify(o.emailNotifications))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await createUploadLink({
        path,
        label: label.trim() || undefined,
        password: password.trim() || undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        maxFiles: maxFiles ? Number(maxFiles) : undefined,
        notifyOwner: canNotify ? notify : false,
      });
      const url = `${window.location.origin}/u/${res.id}`;
      setLink(url);
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setQr).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Link konnte nicht erstellt werden.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // still visible to copy by hand
    }
  }

  return (
    <div className={styles.sharePanel}>
      <div style={{ fontWeight: 650 }}>📥 Upload-Link für „{folderName}“</div>
      {link ? (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- generated data: URL
              <img src={qr} alt="QR-Code für den Upload-Link" width={120} height={120} style={{ borderRadius: 8, border: "1px solid var(--border)" }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={styles.linkResult}>
                <span style={{ flex: 1 }}>{link}</span>
                <button className={copied ? styles.copyButtonCopied : styles.copyButton} onClick={copy}>
                  {copied ? "Kopiert" : "Kopieren"}
                </button>
              </div>
              <p className={styles.hint} style={{ marginTop: 8 }}>
                Wer diesen Link hat, kann Dateien in „{folderName}“ hochladen — aber
                nichts sehen, was dort schon liegt. Widerrufen kannst du ihn unter
                „Meine Freigaben“.
              </p>
            </div>
          </div>
          <button className={styles.smallButtonAccent} onClick={onClose} style={{ marginTop: 4, alignSelf: "flex-start" }}>
            Fertig
          </button>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            Andere können dir damit Dateien in diesen Ordner schicken — z. B. Folien
            von Kommiliton:innen. Sie sehen dabei nichts von deinen Notizen.
          </p>
          {error && <div className={styles.errorBox}>{error}</div>}
          <div className={styles.sharePanelRow}>
            <div className={styles.field} style={{ flex: "1 1 220px" }}>
              <label className={styles.label}>Wofür? (sehen die Hochladenden)</label>
              <input
                className={styles.input}
                placeholder="z. B. Folien Statistik, Woche 3"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Passwort (optional)</label>
              <input className={styles.input} placeholder="Kein Passwort" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: 170 }} />
            </div>
          </div>
          <div className={styles.sharePanelRow}>
            <div className={styles.field}>
              <label className={styles.label}>Gültig für (Tage)</label>
              <input className={styles.input} type="number" min={1} max={365} placeholder="Unbegrenzt" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} style={{ width: 140 }} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Max. Dateien (optional)</label>
              <input className={styles.input} type="number" min={1} max={1000} placeholder="Unbegrenzt" value={maxFiles} onChange={(e) => setMaxFiles(e.target.value)} style={{ width: 140 }} />
            </div>
          </div>
          {canNotify && (
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Mich per E-Mail benachrichtigen, wenn etwas ankommt
            </label>
          )}
          <div className={styles.actionRowInline}>
            <button className={styles.button} onClick={handleCreate} disabled={loading}>
              {loading ? "Wird erstellt …" : "Upload-Link erstellen"}
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
