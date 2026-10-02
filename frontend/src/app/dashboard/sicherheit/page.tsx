"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import { SettingsMenu } from "../../../components/SettingsMenu";
import {
  ApiError,
  deleteAccount,
  fetchCurrentRepository,
  fetchPasskeyCount,
  logout,
  regeneratePin,
  type SessionResponse,
} from "../../../lib/api";
import { browserSupportsWebAuthn, registerPasskey } from "../../../lib/passkeys";
import styles from "../../ui.module.css";

export default function SicherheitPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const [newPin, setNewPin] = useState<string | null>(null);
  const [regeneratingPin, setRegeneratingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentRepository()
      .then((res) => {
        setSession(res);
        return fetchPasskeyCount();
      })
      .then((res) => setPasskeyCount(res.count))
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleAddPasskey() {
    setStatus("loading");
    try {
      await registerPasskey();
      const res = await fetchPasskeyCount();
      setPasskeyCount(res.count);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function handleRegeneratePin() {
    if (
      !window.confirm(
        "Einen neuen Notfall-Code erzeugen? Der alte Code funktioniert danach sofort nicht mehr."
      )
    ) {
      return;
    }
    setRegeneratingPin(true);
    setPinError(null);
    try {
      const res = await regeneratePin();
      setNewPin(res.pin);
    } catch (err) {
      setPinError(err instanceof ApiError ? err.message : "Das hat nicht geklappt.");
    } finally {
      setRegeneratingPin(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        "Konto wirklich endgültig löschen? Alle Notizen, Freigabe-Links und Einstellungen gehen dabei unwiderruflich verloren."
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
      await logout().catch(() => {});
      router.replace("/");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Löschen ist fehlgeschlagen.");
      setDeleting(false);
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

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Einstellungen</div>
          <h1 className={styles.title}>Sicherheit</h1>
          <p className={styles.subtitle}>
            So meldest du dich bei „{session.name}“ an.
          </p>

          <div className={styles.secretGrid}>
            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>E-Mail-Adresse</span>
              <div className={styles.secretValue}>
                <span>{session.email}</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Passkeys</h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            Mit einem Passkey meldest du dich mit Face ID, Fingerabdruck oder
            deinem Gerätecode an — ohne Passwort einzutippen.
          </p>

          {passkeyCount !== null && passkeyCount > 0 && (
            <div className={styles.statusBadge} style={{ marginBottom: 16 }}>
              <span className={styles.statusDot} />
              {passkeyCount} {passkeyCount === 1 ? "Passkey eingerichtet" : "Passkeys eingerichtet"}
            </div>
          )}

          {status === "error" && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              Das hat nicht geklappt. Bitte nochmal versuchen.
            </div>
          )}

          {browserSupportsWebAuthn() ? (
            <button
              className={styles.button}
              onClick={handleAddPasskey}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Wird eingerichtet …" : "Neuen Passkey hinzufügen"}
            </button>
          ) : (
            <p className={styles.hint}>
              Dieses Gerät oder dieser Browser unterstützt leider keine
              Passkeys.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            Notfall-Zugang
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            Falls du E-Mail, Passwort und Passkey mal nicht zur Hand hast,
            kommst du mit deiner Konto-Kennung (<strong>{session.repositoryId}</strong>)
            und einem 4-stelligen Notfall-Code trotzdem rein. Den Code hast
            du nur bei der Kontoerstellung gesehen — hier kannst du bei
            Bedarf einen neuen erzeugen.
          </p>

          {pinError && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {pinError}
            </div>
          )}

          {newPin ? (
            <div className={styles.secretGrid}>
              <div className={`${styles.secretItem} ${styles.onlyOnceItem}`}>
                <span className={styles.secretLabel}>
                  Neuer Notfall-Code
                  <span className={styles.onlyOnceBadge}>Nur jetzt sichtbar</span>
                </span>
                <div className={styles.pinBig}>{newPin}</div>
                <span className={styles.hint}>
                  Notier ihn dir jetzt sicher — er wird danach nirgendwo mehr
                  angezeigt.
                </span>
              </div>
            </div>
          ) : (
            <button
              className={styles.button}
              onClick={handleRegeneratePin}
              disabled={regeneratingPin}
            >
              {regeneratingPin ? "Wird erzeugt …" : "Neuen Notfall-Code erzeugen"}
            </button>
          )}
        </section>

        <section className={styles.card}>
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
          <div style={{ marginTop: 12 }}><SettingsMenu /></div>
        </section>

        <section className={`${styles.card} ${styles.dangerZone}`}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: "var(--danger)" }}>
            Konto löschen
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            Löscht dein Konto endgültig — alle Notizen, Freigabe-Links und
            Einstellungen gehen dabei unwiderruflich verloren. Das kann
            nicht rückgängig gemacht werden.
          </p>

          {session.isAdmin ? (
            <p className={styles.hint}>
              Als Administrator kannst du dein Konto nicht selbst löschen,
              solange es keinen anderen Administrator gibt.
            </p>
          ) : (
            <form onSubmit={handleDeleteAccount}>
              {deleteError && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {deleteError}
                </div>
              )}
              <div className={styles.field} style={{ marginBottom: 16, maxWidth: 320 }}>
                <label className={styles.label} htmlFor="deletePassword">
                  Passwort zur Bestätigung
                </label>
                <input
                  id="deletePassword"
                  className={styles.input}
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className={styles.smallButton}
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                disabled={deleting}
              >
                {deleting ? "Wird gelöscht …" : "Konto endgültig löschen"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
