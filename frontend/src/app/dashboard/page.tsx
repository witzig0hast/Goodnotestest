"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import { fetchCurrentRepository, logout } from "../../lib/api";
import styles from "../ui.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchCurrentRepository()
      .then((session) => setName(session.name))
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function handleLogout() {
    await logout().catch(() => {});
    router.replace("/login");
  }

  if (checking) {
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
          <div className={styles.eyebrow}>Angemeldet</div>
          <h1 className={styles.title}>{name}</h1>
          <p className={styles.subtitle}>
            Hier entsteht als Nächstes die Übersicht deiner Notizen –
            Ordnerstruktur, Vorschau und Download. Aktuell zeigt diese Seite
            nur, dass die Anmeldung funktioniert.
          </p>
          <button className={styles.buttonSecondary} onClick={handleLogout}>
            Abmelden
          </button>
        </section>
      </main>
    </div>
  );
}
