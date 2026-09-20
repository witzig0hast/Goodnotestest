"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { fetchCurrentRepository, fetchPasskeyCount, type SessionResponse } from "../../../lib/api";
import { browserSupportsWebAuthn, registerPasskey } from "../../../lib/passkeys";
import styles from "../../ui.module.css";

export default function SicherheitPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

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

  if (checking || !session) {
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
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
        </section>
      </main>
    </div>
  );
}
