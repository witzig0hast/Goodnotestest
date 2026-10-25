"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import {
  ApiError,
  deleteAccount,
  fetchCurrentRepository,
  fetchPasskeyCount,
  fetchSsoStatus,
  logout,
  regeneratePin,
  ssoLinkStartUrl,
  type SessionResponse,
} from "../../../lib/api";
import { browserSupportsWebAuthn, registerPasskey } from "../../../lib/passkeys";
import styles from "../../ui.module.css";
import { translate, useT } from "../../../lib/i18n";

const SSO_LINK_ERROR_MESSAGES: Record<string, string> = {
  already_linked: "Diese Anmeldung ist bereits mit einem anderen Konto verknüpft.",
  invalid_state: "Die Verknüpfung ist abgelaufen oder wurde unterbrochen. Bitte nochmal versuchen.",
  failed: "Die Verknüpfung hat nicht geklappt. Bitte nochmal versuchen.",
};

function SicherheitPageInner() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const [sso, setSso] = useState<{ enabled: boolean; providerName?: string } | null>(null);
  const [ssoLinkMessage, setSsoLinkMessage] = useState<string | null>(null);
  const [ssoLinkError, setSsoLinkError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentRepository()
      .then((res) => {
        setSession(res);
        return fetchPasskeyCount();
      })
      .then((res) => setPasskeyCount(res.count))
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
    fetchSsoStatus()
      .then(setSso)
      .catch(() => setSso({ enabled: false }));
  }, [router]);

  useEffect(() => {
    if (searchParams.get("sso_linked")) {
      setSsoLinkMessage(translate("Verknüpfung erfolgreich — du kannst dich ab jetzt auch darüber anmelden."));
    }
    const linkError = searchParams.get("sso_link_error");
    if (linkError) {
      setSsoLinkError(SSO_LINK_ERROR_MESSAGES[linkError] ?? SSO_LINK_ERROR_MESSAGES.failed);
    }
  }, [searchParams]);

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
        translate("Einen neuen Notfall-Code erzeugen? Der alte Code funktioniert danach sofort nicht mehr.")
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
      setPinError(err instanceof ApiError ? err.message : translate("Das hat nicht geklappt."));
    } finally {
      setRegeneratingPin(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        translate("Konto wirklich endgültig löschen? Alle Notizen, Freigabe-Links und Einstellungen gehen dabei unwiderruflich verloren.")
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
      setDeleteError(err instanceof ApiError ? err.message : translate("Löschen ist fehlgeschlagen."));
      setDeleting(false);
    }
  }

  if (checking || !session) {
    return (
      <div className={styles.shell}>
        <PageHeader app />
        <main className={styles.main}>
          <Link href="/dashboard" className={styles.backLink}>
            {t("← Zurück zu meinen Notizen")}
          </Link>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader app />
      <main className={styles.main}>
        <Link href="/dashboard" className={styles.backLink}>
          {t("← Zurück zu meinen Notizen")}
        </Link>
        <section className={styles.card}>
          <div className={styles.eyebrow}>{t("Einstellungen")}</div>
          <h1 className={styles.title}>{t("Sicherheit")}</h1>
          <p className={styles.subtitle}>
            {t("So meldest du dich bei „")}{session.name}{t("“ an.")}
          </p>

          <div className={styles.secretGrid}>
            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>{t("E-Mail-Adresse")}</span>
              <div className={styles.secretValue}>
                <span>{session.email}</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{t("Passkeys")}</h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            {t("Mit einem Passkey meldest du dich mit Face ID, Fingerabdruck oder deinem Gerätecode an — ohne Passwort einzutippen.")}
          </p>

          {passkeyCount !== null && passkeyCount > 0 && (
            <div className={styles.statusBadge} style={{ marginBottom: 16 }}>
              <span className={styles.statusDot} />
              {passkeyCount} {passkeyCount === 1 ? t("Passkey eingerichtet") : t("Passkeys eingerichtet")}
            </div>
          )}

          {status === "error" && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {t("Das hat nicht geklappt. Bitte nochmal versuchen.")}
            </div>
          )}

          {browserSupportsWebAuthn() ? (
            <button
              className={styles.button}
              onClick={handleAddPasskey}
              disabled={status === "loading"}
            >
              {status === "loading" ? t("Wird eingerichtet …") : t("Neuen Passkey hinzufügen")}
            </button>
          ) : (
            <p className={styles.hint}>
              {t("Dieses Gerät oder dieser Browser unterstützt leider keine Passkeys.")}
            </p>
          )}
        </section>

        {sso?.enabled && (
          <section className={styles.card}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              {t("Single Sign-On (")}{sso.providerName ?? t("SSO")})
            </h2>
            <p className={styles.hint} style={{ marginBottom: 16 }}>
              {t("Verknüpfe dein Konto mit")} {sso.providerName ?? t("deinem SSO-Dienst")}{t(", um dich künftig auch darüber anmelden zu können.")}
            </p>

            {ssoLinkMessage && (
              <div className={styles.statusBadge} style={{ marginBottom: 16 }}>
                <span className={styles.statusDot} />
                {ssoLinkMessage}
              </div>
            )}

            {ssoLinkError && (
              <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                {ssoLinkError}
              </div>
            )}

            <a href={ssoLinkStartUrl} className={styles.buttonSecondary}>
              {t("Mit {provider} verknüpfen", { provider: sso.providerName ?? "SSO" })}
            </a>
          </section>
        )}

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            {t("Notfall-Zugang")}
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            {t("Falls du E-Mail, Passwort und Passkey mal nicht zur Hand hast, kommst du mit deiner Konto-Kennung (")}<strong>{session.repositoryId}</strong>{t(") und einem 4-stelligen Notfall-Code trotzdem rein. Den Code hast du nur bei der Kontoerstellung gesehen — hier kannst du bei Bedarf einen neuen erzeugen.")}
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
                  {t("Neuer Notfall-Code")}
                  <span className={styles.onlyOnceBadge}>{t("Nur jetzt sichtbar")}</span>
                </span>
                <div className={styles.pinBig}>{newPin}</div>
                <span className={styles.hint}>
                  {t("Notier ihn dir jetzt sicher — er wird danach nirgendwo mehr angezeigt.")}
                </span>
              </div>
            </div>
          ) : (
            <button
              className={styles.button}
              onClick={handleRegeneratePin}
              disabled={regeneratingPin}
            >
              {regeneratingPin ? t("Wird erzeugt …") : t("Neuen Notfall-Code erzeugen")}
            </button>
          )}
        </section>


        <section className={`${styles.card} ${styles.dangerZone}`}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: "var(--danger)" }}>
            {t("Konto löschen")}
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            {t("Löscht dein Konto endgültig — alle Notizen, Freigabe-Links und Einstellungen gehen dabei unwiderruflich verloren. Das kann nicht rückgängig gemacht werden.")}
          </p>

          {session.isAdmin ? (
            <p className={styles.hint}>
              {t("Als Administrator kannst du dein Konto nicht selbst löschen, solange es keinen anderen Administrator gibt.")}
            </p>
          ) : (
            <form onSubmit={handleDeleteAccount}>
              {deleteError && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {deleteError}
                </div>
              )}
              {session.hasPassword ? (
                <div className={styles.field} style={{ marginBottom: 16, maxWidth: 320 }}>
                  <label className={styles.label} htmlFor="deletePassword">
                    {t("Passwort zur Bestätigung")}
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
              ) : (
                <p className={styles.hint} style={{ marginBottom: 16 }}>
                  {t("Dieses Konto hat kein Passwort (angelegt über SSO) — zum Löschen reicht die Bestätigung unten.")}
                </p>
              )}
              <button
                type="submit"
                className={styles.smallButton}
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                disabled={deleting}
              >
                {deleting ? t("Wird gelöscht …") : t("Konto endgültig löschen")}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export default function SicherheitPage() {
  return (
    <Suspense fallback={null}>
      <SicherheitPageInner />
    </Suspense>
  );
}
