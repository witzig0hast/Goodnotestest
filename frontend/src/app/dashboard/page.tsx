"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import { FileBrowser } from "../../components/FileBrowser";
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
      <main className={styles.main} style={{ maxWidth: 820 }}>
        <section className={styles.card}>
          <div className={styles.toolbar} style={{ marginBottom: 4 }}>
            <div>
              <div className={styles.eyebrow}>Angemeldet</div>
              <h1 className={styles.title} style={{ marginBottom: 0 }}>
                {name}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/dashboard/sicherheit" className={styles.smallButton}>
                Sicherheit
              </Link>
              <Link href="/dashboard/nextcloud" className={styles.smallButton}>
                Nextcloud-Export
              </Link>
              <button className={styles.smallButton} onClick={handleLogout}>
                Abmelden
              </button>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <Suspense fallback={<p className={styles.hint}>Notizen werden geladen …</p>}>
            <FileBrowser />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
