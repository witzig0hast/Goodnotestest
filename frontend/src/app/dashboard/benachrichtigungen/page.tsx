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
  type SessionResponse,
} from "../../../lib/api";
import styles from "../../ui.module.css";

export default function BenachrichtigungenPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  const [notifyAfterDays, setNotifyAfterDays] = useState("3");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    fetchCurrentRepository()
      .then((sessionRes) => {
        setSession(sessionRes);
        return fetchNotificationSettings();
      })
      .then((res) => {
        setSettings(res);
        if (res.notifyAfterDays) setNotifyAfterDays(String(res.notifyAfterDays));
      })
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const days = Number(notifyAfterDays);
      await saveNotificationSettings({ notifyAfterDays: days });
      setSettings({ enabled: true, notifyAfterDays: days });
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
      await sendTestNotification();
      setTestSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Testmail konnte nicht gesendet werden."
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleDisable() {
    await disableNotifications().catch(() => {});
    setSettings({ enabled: false, notifyAfterDays: null });
  }

  if (checking || !settings || !session) {
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
            Wir schicken eine E-Mail an <strong>{session.email}</strong>, falls
            seit einer Weile kein neues GoodNotes-Backup mehr angekommen ist —
            praktisch, wenn WLAN oder Zugangsdaten mal kaputtgehen und du es
            sonst erst spät bemerkst.
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
              Testmail gesendet — schau in deinem Postfach nach.
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className={styles.field} style={{ marginBottom: 20 }}>
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
            <div className={styles.actionRowInline}>
              <button className={styles.button} type="submit" disabled={saving}>
                {saving ? "Wird gespeichert …" : "Speichern"}
              </button>
              <button
                type="button"
                className={styles.smallButton}
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? "Wird gesendet …" : "Testmail senden"}
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
