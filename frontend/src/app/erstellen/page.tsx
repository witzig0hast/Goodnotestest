"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { ApiError, createRepository, type CreateRepositoryResponse } from "../../lib/api";
import { browserSupportsWebAuthn, registerPasskey } from "../../lib/passkeys";
import styles from "../ui.module.css";

export default function ErstellenPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateRepositoryResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await createRepository({
        name: name.trim() || "Meine Notizen",
        email: email.trim(),
        password,
      });
      setResult(res);
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

  async function handleAddPasskey() {
    setPasskeyStatus("loading");
    try {
      await registerPasskey();
      setPasskeyStatus("done");
    } catch {
      setPasskeyStatus("error");
    }
  }

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    } catch {
      // Clipboard access can fail (e.g. insecure context) — the value is
      // still visible on screen, so this is not fatal.
    }
  }

  if (result) {
    const webdavUrl = `${
      process.env.NEXT_PUBLIC_WEBDAV_URL ?? "http://localhost:4000"
    }/webdav/${result.repositoryId}`;

    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <div className={styles.eyebrow}>Fertig eingerichtet</div>
            <h1 className={styles.title}>„{result.name}“ ist bereit</h1>
            <p className={styles.subtitle}>
              Du bist schon angemeldet. Für GoodNotes brauchst du noch die
              WebDAV-Zugangsdaten unten — trag sie einmal ein, dann läuft
              alles automatisch.
            </p>

            <div className={styles.secretGrid}>
              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>
                  WebDAV-Adresse (für GoodNotes → Einstellungen → Backup)
                </span>
                <div className={styles.secretValue}>
                  <span>{webdavUrl}</span>
                  <button
                    className={styles.copyButton}
                    onClick={() => copy("webdavUrl", webdavUrl)}
                  >
                    {copiedField === "webdavUrl" ? "Kopiert" : "Kopieren"}
                  </button>
                </div>
              </div>

              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>WebDAV-Benutzername</span>
                <div className={styles.secretValue}>
                  <span>{result.webdav.username}</span>
                  <button
                    className={styles.copyButton}
                    onClick={() => copy("webdavUser", result.webdav.username)}
                  >
                    {copiedField === "webdavUser" ? "Kopiert" : "Kopieren"}
                  </button>
                </div>
              </div>

              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>WebDAV-Passwort</span>
                <div className={styles.secretValue}>
                  <span>{result.webdav.password}</span>
                  <button
                    className={styles.copyButton}
                    onClick={() =>
                      copy("webdavPassword", result.webdav.password)
                    }
                  >
                    {copiedField === "webdavPassword" ? "Kopiert" : "Kopieren"}
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
                  Trage die drei Angaben von oben ein.
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepText}>
                  Tippe auf „Jetzt sichern“ — fertig. Deine Notizen erscheinen
                  ab jetzt automatisch in deinem Konto.
                </div>
              </div>
            </div>
          </section>

          {browserSupportsWebAuthn() && (
            <section className={styles.card}>
              <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
                Schneller anmelden mit Passkey
              </h2>
              <p className={styles.hint} style={{ marginBottom: 16 }}>
                Statt Passwort einzutippen, kannst du dich beim nächsten Mal
                mit Face ID, Fingerabdruck oder deinem Gerätecode anmelden.
              </p>
              {passkeyStatus === "done" ? (
                <div className={styles.statusBadge}>
                  <span className={styles.statusDot} />
                  Passkey eingerichtet
                </div>
              ) : (
                <>
                  {passkeyStatus === "error" && (
                    <div className={styles.errorBox} style={{ marginBottom: 12 }}>
                      Das hat nicht geklappt. Du kannst es später jederzeit in
                      den Einstellungen erneut versuchen.
                    </div>
                  )}
                  <button
                    className={styles.buttonSecondary}
                    onClick={handleAddPasskey}
                    disabled={passkeyStatus === "loading"}
                  >
                    {passkeyStatus === "loading"
                      ? "Wird eingerichtet …"
                      : "Passkey jetzt einrichten"}
                  </button>
                </>
              )}
            </section>
          )}

          <section className={styles.card}>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              Für den Notfall
            </h2>
            <p className={styles.hint} style={{ marginBottom: 16 }}>
              Falls du E-Mail, Passwort und Passkey mal nicht zur Hand hast,
              kommst du mit diesen zwei Angaben trotzdem rein. Notier sie dir
              sicher, z. B. in deinem Passwortmanager.
            </p>
            <div className={styles.secretGrid}>
              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>Konto-Kennung</span>
                <div className={styles.secretValue}>
                  <span>{result.repositoryId}</span>
                  <button
                    className={styles.copyButton}
                    onClick={() => copy("id", result.repositoryId)}
                  >
                    {copiedField === "id" ? "Kopiert" : "Kopieren"}
                  </button>
                </div>
              </div>
              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>Notfall-Code</span>
                <div className={styles.pinBig}>{result.pin}</div>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.actionRowInline}>
              <Link href="/dashboard" className={styles.button}>
                Zu meinen Notizen
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.eyebrow}>Neu hier</div>
          <h1 className={styles.title}>Konto erstellen</h1>
          <p className={styles.subtitle}>
            Nur drei Angaben, dann bist du fertig.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="name">
                Name (z. B. deine Praxis)
              </label>
              <input
                id="name"
                className={styles.input}
                placeholder="z. B. Praxis Musterfrau"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="du@beispiel.de"
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
                placeholder="Mindestens 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>

          <div className={styles.actionRowInline}>
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Wird erstellt …" : "Konto erstellen"}
            </button>
            <Link href="/" className={styles.buttonSecondary}>
              Abbrechen
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
