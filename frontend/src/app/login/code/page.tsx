"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "../../../components/PageHeader";
import { ApiError, loginWithCode } from "../../../lib/api";
import styles from "../../ui.module.css";

export default function CodeLoginPage() {
  const router = useRouter();
  const [repositoryId, setRepositoryId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithCode(repositoryId.trim().toUpperCase(), pin.trim());
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

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.eyebrow}>Notfall-Zugang</div>
          <h1 className={styles.title}>Mit Konto-Kennung anmelden</h1>
          <p className={styles.subtitle}>
            Falls du dein Passwort oder deinen Passkey gerade nicht zur Hand
            hast: Gib die Konto-Kennung und den Notfall-Code ein, die du bei
            der Einrichtung erhalten hast.
          </p>

          {error && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="repositoryId">
                Konto-Kennung
              </label>
              <input
                id="repositoryId"
                className={styles.input}
                placeholder="z. B. 4F6R3V"
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="pin">
                Notfall-Code
              </label>
              <input
                id="pin"
                className={styles.pinInput}
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
              />
            </div>
          </div>

          <div className={styles.actionRowInline}>
            <button
              className={styles.button}
              type="submit"
              disabled={loading || pin.length !== 4 || !repositoryId.trim()}
            >
              {loading ? "Wird geprüft …" : "Anmelden"}
            </button>
            <Link href="/login" className={styles.buttonSecondary}>
              Zurück
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
