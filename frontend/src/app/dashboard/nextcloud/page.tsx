"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import {
  ApiError,
  connectNextcloud,
  disconnectNextcloud,
  fetchCurrentRepository,
  fetchNextcloudStatus,
  pullFromNextcloud,
  saveNextcloudSyncPath,
  syncNextcloud,
  type NextcloudStatus,
} from "../../../lib/api";
import styles from "../../ui.module.css";

export default function NextcloudSettingsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<NextcloudStatus | null>(null);

  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ uploaded: number; failed: number } | null>(
    null
  );
  const [syncError, setSyncError] = useState<string | null>(null);

  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<{ downloaded: number; failed: number } | null>(
    null
  );
  const [pullError, setPullError] = useState<string | null>(null);

  const [syncPath, setSyncPath] = useState("");
  const [syncPathSaving, setSyncPathSaving] = useState(false);
  const [syncPathSaved, setSyncPathSaved] = useState(false);

  useEffect(() => {
    fetchCurrentRepository()
      .then(() => fetchNextcloudStatus())
      .then((res) => {
        setStatus(res);
        setSyncPath(res.syncPath ?? "");
      })
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSaveSyncPath(e: React.FormEvent) {
    e.preventDefault();
    setSyncPathSaving(true);
    setSyncPathSaved(false);
    try {
      const res = await saveNextcloudSyncPath(syncPath.trim());
      setStatus((prev) => (prev ? { ...prev, syncPath: res.syncPath } : prev));
      setSyncPathSaved(true);
      setTimeout(() => setSyncPathSaved(false), 1500);
    } catch {
      // ignore — field simply keeps its current value
    } finally {
      setSyncPathSaving(false);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError(null);
    try {
      await connectNextcloud({ url: url.trim(), username: username.trim(), password });
      const newStatus = await fetchNextcloudStatus();
      setStatus(newStatus);
      setPassword("");
    } catch (err) {
      setConnectError(
        err instanceof ApiError ? err.message : "Verbindung ist fehlgeschlagen."
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handlePull() {
    setPulling(true);
    setPullError(null);
    setPullResult(null);
    try {
      const result = await pullFromNextcloud();
      setPullResult(result);
    } catch (err) {
      setPullError(err instanceof ApiError ? err.message : "Abruf ist fehlgeschlagen.");
    } finally {
      setPulling(false);
    }
  }

  async function handleDisconnect() {
    await disconnectNextcloud().catch(() => {});
    setStatus({ connected: false, url: null, username: null, syncPath: null });
    setSyncResult(null);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await syncNextcloud();
      setSyncResult(result);
    } catch (err) {
      setSyncError(
        err instanceof ApiError ? err.message : "Export ist fehlgeschlagen."
      );
    } finally {
      setSyncing(false);
    }
  }

  if (checking || !status) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.hint}>Wird geladen …</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Einstellungen</div>
          <h1 className={styles.title}>Nextcloud-Export</h1>
          <p className={styles.subtitle}>
            Verbinde deine eigene Nextcloud, um deine Notizen zusätzlich dort zu
            spiegeln — mit derselben Ordnerstruktur wie hier.
          </p>

          {status.connected ? (
            <>
              <div className={styles.statusBadge} style={{ marginBottom: 16 }}>
                <span className={styles.statusDot} />
                Verbunden mit {status.url}
              </div>
              <p className={styles.hint} style={{ marginBottom: 16 }}>
                Angemeldet als {status.username}
              </p>

              {syncError && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {syncError}
                </div>
              )}
              {syncResult && (
                <div className={styles.sharePanel} style={{ marginBottom: 16 }}>
                  {syncResult.uploaded} Datei(en) übertragen
                  {syncResult.failed > 0 && `, ${syncResult.failed} fehlgeschlagen`}.
                </div>
              )}

              <div className={styles.actionRowInline}>
                <button className={styles.button} onClick={handleSync} disabled={syncing}>
                  {syncing ? "Wird exportiert …" : "Jetzt nach Nextcloud exportieren"}
                </button>
                <button className={styles.smallButton} onClick={handleDisconnect}>
                  Verbindung trennen
                </button>
              </div>

              <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />

              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                Nur einen bestimmten Ordner abgleichen
              </h2>
              <p className={styles.hint} style={{ marginBottom: 12 }}>
                Leer lassen, um wie bisher alles zu spiegeln — oder einen
                Ordnernamen eintragen (z. B. „Uni“), um Export und Abruf auf
                diesen Ordner zu beschränken.
              </p>
              <form onSubmit={handleSaveSyncPath} className={styles.actionRowInline}>
                <input
                  className={styles.input}
                  placeholder="Alles (kein bestimmter Ordner)"
                  value={syncPath}
                  onChange={(e) => setSyncPath(e.target.value)}
                  style={{ width: 240 }}
                />
                <button className={styles.smallButton} type="submit" disabled={syncPathSaving}>
                  {syncPathSaving ? "Wird gespeichert …" : syncPathSaved ? "Gespeichert" : "Speichern"}
                </button>
              </form>

              <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />

              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                Von Nextcloud abrufen
              </h2>
              <p className={styles.hint} style={{ marginBottom: 12 }}>
                Holt Dateien, die in deiner Nextcloud liegen, aber hier noch
                fehlen — z. B. wenn du dort direkt etwas hinzugefügt hast.
                Bestehende Dateien hier werden dabei nie verändert oder
                gelöscht.
              </p>
              {pullError && (
                <div className={styles.errorBox} style={{ marginBottom: 12 }}>
                  {pullError}
                </div>
              )}
              {pullResult && (
                <div className={styles.sharePanel} style={{ marginBottom: 12 }}>
                  {pullResult.downloaded} Datei(en) abgeholt
                  {pullResult.failed > 0 && `, ${pullResult.failed} fehlgeschlagen`}.
                </div>
              )}
              <button className={styles.smallButton} onClick={handlePull} disabled={pulling}>
                {pulling ? "Wird abgerufen …" : "Jetzt von Nextcloud abrufen"}
              </button>
            </>
          ) : (
            <form onSubmit={handleConnect}>
              {connectError && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {connectError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ncUrl">
                    Nextcloud-Adresse
                  </label>
                  <input
                    id="ncUrl"
                    className={styles.input}
                    placeholder="https://cloud.example.com/remote.php/dav/files/dein-name"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ncUser">
                    Benutzername
                  </label>
                  <input
                    id="ncUser"
                    className={styles.input}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ncPass">
                    App-Passwort
                  </label>
                  <input
                    id="ncPass"
                    className={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <span className={styles.hint}>
                    Erstelle in Nextcloud unter Einstellungen → Sicherheit ein
                    eigenes App-Passwort, statt dein normales Passwort zu
                    verwenden.
                  </span>
                </div>
              </div>
              <button className={styles.button} type="submit" disabled={connecting}>
                {connecting ? "Wird geprüft …" : "Verbinden"}
              </button>
            </form>
          )}
        </section>

        <section className={styles.card}>
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
        </section>
      </main>
    </div>
  );
}
