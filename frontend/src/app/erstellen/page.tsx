"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { ApiError, createRepository, type CreateRepositoryResponse } from "../../lib/api";
import styles from "../ui.module.css";

export default function ErstellenPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateRepositoryResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await createRepository(name.trim() || "Meine Notizen");
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
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <div className={styles.eyebrow}>Fertig eingerichtet</div>
            <h1 className={styles.title}>„{result.name}“ ist bereit</h1>
            <p className={styles.subtitle}>
              Notiere dir diese Angaben jetzt – sie werden aus
              Sicherheitsgründen nirgends gespeichert und nur dieses eine Mal
              angezeigt.
            </p>

            <div className={styles.warningBox} style={{ marginBottom: 20 }}>
              Diese Seite verlässt du gleich – halte die Daten also erst
              fest, z. B. mit einem Screenshot oder Passwortmanager.
            </div>

            <div className={styles.secretGrid}>
              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>Repository-ID</span>
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
                <span className={styles.secretLabel}>
                  Zugangs-PIN (zum Ansehen &amp; Herunterladen der Notizen)
                </span>
                <div className={styles.pinBig}>{result.pin}</div>
              </div>

              <div className={styles.secretItem}>
                <span className={styles.secretLabel}>
                  WebDAV-Adresse (für GoodNotes → Einstellungen → Backup)
                </span>
                <div className={styles.secretValue}>
                  <span>
                    {process.env.NEXT_PUBLIC_WEBDAV_URL ??
                      "http://localhost:4000"}
                    /webdav/{result.repositoryId}
                  </span>
                  <button
                    className={styles.copyButton}
                    onClick={() =>
                      copy(
                        "webdavUrl",
                        `${
                          process.env.NEXT_PUBLIC_WEBDAV_URL ??
                          "http://localhost:4000"
                        }/webdav/${result.repositoryId}`
                      )
                    }
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
            <p className={styles.hint} style={{ marginBottom: 12 }}>
              Diese WebDAV-Zugangsdaten sind schon reserviert – der Empfang
              der GoodNotes-Backups selbst folgt im nächsten Bauabschnitt.
              Heute kannst du dich bereits mit Repository-ID und PIN
              einloggen.
            </p>
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
                  Trage die WebDAV-Adresse, den Benutzernamen und das
                  Passwort von oben ein.
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepText}>
                  Tippe auf „Jetzt sichern“ – fertig. Ab jetzt kannst du dich
                  mit der Repository-ID und dem PIN hier einloggen und deine
                  Notizen ansehen oder herunterladen.
                </div>
              </div>
            </div>
            <div className={styles.actionRowInline} style={{ marginTop: 24 }}>
              <Link href="/login" className={styles.button}>
                Jetzt einloggen
              </Link>
              <Link href="/" className={styles.buttonSecondary}>
                Zur Startseite
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
          <h1 className={styles.title}>Repository erstellen</h1>
          <p className={styles.subtitle}>
            Gib deinem Repository einen Namen, mit dem du es wiedererkennst –
            zum Beispiel den Namen deiner Praxis oder deinen eigenen Namen.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.field} style={{ marginBottom: 20 }}>
            <label className={styles.label} htmlFor="name">
              Name des Repositorys
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

          <div className={styles.actionRowInline}>
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Wird erstellt …" : "Repository erstellen"}
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
