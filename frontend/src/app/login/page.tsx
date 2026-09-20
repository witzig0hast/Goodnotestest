"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { ApiError, loginWithPassword } from "../../lib/api";
import { browserSupportsWebAuthn, loginWithPasskey } from "../../lib/passkeys";
import styles from "../ui.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportsPasskeys] = useState(() => browserSupportsWebAuthn());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithPassword(email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Der Server ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal."
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
      setError("Passkey-Anmeldung hat nicht geklappt. Versuch es nochmal oder nutze dein Passwort.");
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.eyebrow}>Willkommen zurück</div>
          <h1 className={styles.title}>Anmelden</h1>

          {error && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {error}
            </div>
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
                {passkeyLoading ? "Wird geprüft …" : "Mit Passkey anmelden"}
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
                oder
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.actionRowInline}>
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Wird geprüft …" : "Anmelden"}
            </button>
            <Link href="/erstellen" className={styles.buttonSecondary}>
              Noch kein Konto?
            </Link>
          </div>

          <p className={styles.hint} style={{ marginTop: 20, textAlign: "center" }}>
            <Link href="/login/code" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Kein Zugriff auf E-Mail oder Passkey?
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
