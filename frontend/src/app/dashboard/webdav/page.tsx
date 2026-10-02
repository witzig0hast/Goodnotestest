"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import { SettingsMenu } from "../../../components/SettingsMenu";
import {
  ApiError,
  fetchCurrentRepository,
  regenerateWebdavPassword,
  type SessionResponse,
} from "../../../lib/api";
import styles from "../../ui.module.css";

export default function WebdavPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentRepository()
      .then(setSession)
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    } catch {
      // the value is still visible on screen, so this is not fatal
    }
  }

  async function handleRegenerate() {
    if (
      !window.confirm(
        "Ein neues WebDAV-Passwort erzeugen? Das alte Passwort funktioniert danach sofort nicht mehr — GoodNotes muss dann mit dem neuen Passwort neu eingerichtet werden."
      )
    ) {
      return;
    }
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await regenerateWebdavPassword();
      setNewPassword(res.password);
    } catch (err) {
      setRegenerateError(
        err instanceof ApiError ? err.message : "Das hat nicht geklappt. Bitte nochmal versuchen."
      );
    } finally {
      setRegenerating(false);
    }
  }

  if (checking || !session) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  const webdavUrl = `${
    process.env.NEXT_PUBLIC_WEBDAV_URL ?? "http://localhost:4000"
  }/webdav/${session.repositoryId}`;

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Einstellungen</div>
          <h1 className={styles.title}>WebDAV-Zugang</h1>
          <p className={styles.subtitle}>
            Diese Angaben brauchst du, um GoodNotes auf einem (weiteren)
            Gerät einzurichten — jederzeit hier nachzuschlagen, nicht nur
            bei der Kontoerstellung.
          </p>

          <div className={styles.secretGrid}>
            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>
                WebDAV-Adresse (für GoodNotes → Einstellungen → Backup)
              </span>
              <div className={styles.secretValue}>
                <span>{webdavUrl}</span>
                <button
                  className={copiedField === "url" ? styles.copyButtonCopied : styles.copyButton}
                  onClick={() => copy("url", webdavUrl)}
                >
                  {copiedField === "url" ? "Kopiert" : "Kopieren"}
                </button>
              </div>
            </div>

            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>WebDAV-Benutzername</span>
              <div className={styles.secretValue}>
                <span>{session.webdavUsername}</span>
                <button
                  className={copiedField === "user" ? styles.copyButtonCopied : styles.copyButton}
                  onClick={() => copy("user", session.webdavUsername)}
                >
                  {copiedField === "user" ? "Kopiert" : "Kopieren"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            So richtest du GoodNotes ein
          </h2>
          <div className={styles.stepList}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepText}>
                Öffne GoodNotes und gehe zu Einstellungen → Backup → WebDAV.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepText}>
                Trage die Adresse und den Benutzernamen von oben ein, dazu
                dein WebDAV-Passwort (das kennst du nur, wenn du es dir
                notiert hast oder gleich unten ein neues erzeugst).
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepText}>
                Tippe auf „Jetzt sichern“ — fertig.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            WebDAV-Passwort vergessen?
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            Das Passwort selbst wird aus Sicherheitsgründen nirgendwo
            gespeichert — es wurde dir nur einmal direkt nach dem Erstellen
            des Kontos angezeigt. Falls du es nicht mehr hast, erzeug hier
            ein neues (das alte funktioniert danach nicht mehr).
          </p>

          {regenerateError && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {regenerateError}
            </div>
          )}

          {newPassword ? (
            <div className={styles.secretGrid}>
              <div className={`${styles.secretItem} ${styles.onlyOnceItem}`}>
                <span className={styles.secretLabel}>
                  Neues WebDAV-Passwort
                  <span className={styles.onlyOnceBadge}>Nur jetzt sichtbar</span>
                </span>
                <div className={styles.secretValue}>
                  <span>{newPassword}</span>
                  <button
                    className={
                      copiedField === "newPassword" ? styles.copyButtonCopied : styles.copyButton
                    }
                    onClick={() => copy("newPassword", newPassword)}
                  >
                    {copiedField === "newPassword" ? "Kopiert" : "Kopieren"}
                  </button>
                </div>
                <span className={styles.hint} style={{ marginTop: 4 }}>
                  Jetzt in GoodNotes eintragen — dieses Passwort wird danach
                  nirgendwo mehr angezeigt.
                </span>
              </div>
            </div>
          ) : (
            <button className={styles.button} onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? "Wird erzeugt …" : "Neues Passwort erzeugen"}
            </button>
          )}
        </section>

        <section className={styles.card}>
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
          <div style={{ marginTop: 12 }}>
            <SettingsMenu />
          </div>
        </section>
      </main>
    </div>
  );
}
