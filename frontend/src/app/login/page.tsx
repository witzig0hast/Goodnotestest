"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { TotpLoginStep } from "../../components/TotpLoginStep";
import { ApiError, fetchSsoStatus, loginWithPassword, ssoStartUrl } from "../../lib/api";
import { browserSupportsWebAuthn, loginWithPasskey } from "../../lib/passkeys";
import { translate, useT } from "../../lib/i18n";
import styles from "../ui.module.css";

const SSO_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Die Anmeldung ist abgelaufen oder wurde unterbrochen. Bitte nochmal versuchen.",
  pending: "Dein Konto wird noch geprüft. Du kannst dich anmelden, sobald es freigeschaltet ist.",
  not_configured: "Diese Anmeldemethode ist auf diesem Server nicht eingerichtet.",
  failed: "Die Anmeldung über den Single-Sign-On-Dienst hat nicht geklappt. Bitte nochmal versuchen.",
};

const noopSubscribe = () => () => {};

function LoginPageInner() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server render has no WebAuthn — reading it via an external store
  // with a `false` server snapshot keeps the first client render identical
  // to the server HTML (computing it in useState caused a hydration error
  // on every visit to this page).
  const supportsPasskeys = useSyncExternalStore(
    noopSubscribe,
    browserSupportsWebAuthn,
    () => false
  );
  const [sso, setSso] = useState<{ enabled: boolean; providerName?: string } | null>(null);

  useEffect(() => {
    fetchSsoStatus()
      .then(setSso)
      .catch(() => setSso({ enabled: false }));
  }, []);

  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) {
      setError(SSO_ERROR_MESSAGES[ssoError] ?? SSO_ERROR_MESSAGES.failed);
    }
  }, [searchParams]);

  const [totpTicket, setTotpTicket] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await loginWithPassword(email.trim(), password);
      if ("totpRequired" in res) {
        setTotpTicket(res.ticket);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : translate("Der Server ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setPasskeyLoading(true);
    setError(null);
    try {
      await loginWithPasskey();
      router.push("/dashboard");
    } catch {
      setError(translate("Passkey-Anmeldung hat nicht geklappt. Versuch es nochmal oder nutze dein Passwort."));
    } finally {
      setPasskeyLoading(false);
    }
  }

  if (totpTicket) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <TotpLoginStep
            ticket={totpTicket}
            onDone={() => router.push("/dashboard")}
            onCancel={() => {
              setTotpTicket(null);
              setPassword("");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.eyebrow}>{t("Willkommen zurück")}</div>
          <h1 className={styles.title}>{t("Anmelden")}</h1>

          {error && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {t(error)}
            </div>
          )}

          {sso?.enabled && (
            <>
              <a
                href={ssoStartUrl}
                className={styles.button}
                style={{ width: "100%", marginBottom: 20, display: "block", textAlign: "center" }}
              >
                {t("Mit {provider} anmelden", { provider: sso.providerName ?? t("SSO") })}
              </a>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  color: "var(--muted)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                {t("oder")}
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
            </>
          )}

          {supportsPasskeys && (
            <>
              <button
                type="button"
                className={styles.button}
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                style={{ width: "100%", marginBottom: 20 }}
              >
                {passkeyLoading ? t("Wird geprüft …") : t("Mit Passkey anmelden")}
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  color: "var(--muted)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                {t("oder")}
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                {t("E-Mail-Adresse")}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={styles.input}
                placeholder={t("du@beispiel.de")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                {t("Passwort")}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.actionRowInline}>
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? t("Wird geprüft …") : t("Anmelden")}
            </button>
            <Link href="/erstellen" className={styles.buttonSecondary}>
              {t("Noch kein Konto?")}
            </Link>
          </div>

          <p className={styles.hint} style={{ marginTop: 20, textAlign: "center" }}>
            <Link href="/login/code" style={{ color: "var(--accent)", fontWeight: 600 }}>
              {t("Kein Zugriff auf E-Mail oder Passkey?")}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
