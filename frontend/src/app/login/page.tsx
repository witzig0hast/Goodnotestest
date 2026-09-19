"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { ApiError, login } from "../../lib/api";
import styles from "../ui.module.css";

export default function LoginPage() {
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
      await login(repositoryId.trim().toUpperCase(), pin.trim());
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
          <div className={styles.eyebrow}>Willkommen zurück</div>
          <h1 className={styles.title}>Anmelden</h1>
          <p className={styles.subtitle}>
            Gib die Repository-ID und den 4-stelligen PIN ein, die du bei der
            Erstellung erhalten hast.
          </p>

          {error && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="repositoryId">
                Repository-ID
              </label>
              <input
                id="repositoryId"
                className={styles.input}
                placeholder="z. B. 4F6R3VCM"
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="pin">
                PIN
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
            <Link href="/erstellen" className={styles.buttonSecondary}>
              Noch kein Repository?
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
