"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import {
  ApiError,
  disableNotifications,
  fetchCurrentRepository,
  fetchNotificationSettings,
  saveNotificationSettings,
  sendTestNotification,
  type NotificationSettings,
} from "../../../lib/api";
import styles from "../../ui.module.css";

export default function BenachrichtigungenPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  const [ntfyUrl, setNtfyUrl] = useState("");
  const [ntfyTopic, setNtfyTopic] = useState("");
  const [notifyAfterDays, setNotifyAfterDays] = useState("3");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    fetchCurrentRepository()
      .then(() => fetchNotificationSettings())
      .then((res) => {
        setSettings(res);
        if (res.ntfyUrl) setNtfyUrl(res.ntfyUrl);
        if (res.ntfyTopic) setNtfyTopic(res.ntfyTopic);
        if (res.notifyAfterDays) setNotifyAfterDays(String(res.notifyAfterDays));
      })
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  function currentInput() {
    return {
      ntfyUrl: ntfyUrl.trim(),
      ntfyTopic: ntfyTopic.trim(),
      notifyAfterDays: Number(notifyAfterDays),
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveNotificationSettings(currentInput());
      setSettings({ enabled: true, ...currentInput() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Speichern ist fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setTestSent(false);
    try {
      await sendTestNotification(currentInput());
      setTestSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Testnachricht konnte nicht gesendet werden."
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleDisable() {
    await disableNotifications().catch(() => {});
    setSettings({ enabled: false, ntfyUrl: null, ntfyTopic: null, notifyAfterDays: null });
  }

  if (checking || !settings) {
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
          <h1 className={styles.title}>Backup-Erinnerung</h1>
          <p className={styles.subtitle}>
            Bekomme eine Push-Nachricht über{" "}
            <a href="https://ntfy.sh" target="_blank" rel="noreferrer">
              ntfy
            </a>
            , falls seit einer Weile kein neues GoodNotes-Backup mehr
            angekommen ist — praktisch, wenn WLAN oder Zugangsdaten mal
            kaputtgehen und du es sonst erst spät bemerkst.
          </p>

          {settings.enabled && (
            <div className={styles.statusBadge} style={{ marginBottom: 16 }}>
              <span className={styles.statusDot} />
              Aktiv — Erinnerung nach {settings.notifyAfterDays} Tagen ohne Backup
            </div>
          )}

          {error && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}
          {testSent && (
            <div className={styles.sharePanel} style={{ marginBottom: 16 }}>
              Testnachricht gesendet — schau in deiner ntfy-App nach.
            </div>
          )}

          <form onSubmit={handleSave}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ntfyUrl">
                  ntfy-Adresse
                </label>
                <input
                  id="ntfyUrl"
                  className={styles.input}
                  placeholder="https://ntfy.sh oder deine eigene ntfy-Adresse"
                  value={ntfyUrl}
                  onChange={(e) => setNtfyUrl(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ntfyTopic">
                  Thema (Topic)
                </label>
                <input
                  id="ntfyTopic"
                  className={styles.input}
                  placeholder="z. B. meine-praxis-goodshare"
                  value={ntfyTopic}
                  onChange={(e) => setNtfyTopic(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="days">
                  Erinnern nach wie vielen Tagen ohne neues Backup?
                </label>
                <input
                  id="days"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={90}
                  value={notifyAfterDays}
                  onChange={(e) => setNotifyAfterDays(e.target.value)}
                  style={{ width: 120 }}
                  required
                />
              </div>
            </div>
            <div className={styles.actionRowInline}>
              <button className={styles.button} type="submit" disabled={saving}>
                {saving ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button
                type="button"
                className={styles.smallButton}
                onClick={handleTest}
                disabled={testing || !ntfyUrl.trim() || !ntfyTopic.trim()}
              >
                {testing ? "Wird gesendet …" : "Testnachricht senden"}
              </button>
              {settings.enabled && (
                <button type="button" className={styles.smallButton} onClick={handleDisable}>
                  Deaktivieren
                </button>
              )}
            </div>
          </form>
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
