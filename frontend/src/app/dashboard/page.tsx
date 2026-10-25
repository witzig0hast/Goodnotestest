"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/LoadingState";
import { FileBrowser } from "../../components/FileBrowser";
import { GettingStarted } from "../../components/GettingStarted";
import { hasSeenTour, openTour } from "../../components/WelcomeTour";
import { ApiError, fetchCurrentRepository } from "../../lib/api";
import { isOfflineEnabled } from "../../lib/offline";
import { OfflineView } from "../../components/OfflineView";
import { useT } from "../../lib/i18n";
import styles from "../ui.module.css";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

export default function DashboardPage() {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [hello, setHello] = useState("Hallo");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetchCurrentRepository()
      .then((session) => {
        setName(session.name);
        setHello(greeting());
        // First visit after signing up: start the guided tour once, so a
        // brand-new user isn't left guessing what this page is for.
        if (!hasSeenTour()) setTimeout(openTour, 400);
      })
      .catch((err) => {
        // A network failure (not a "not signed in" answer) with offline
        // favorites switched on: show those instead of the login page.
        if (!(err instanceof ApiError) && isOfflineEnabled()) setOffline(true);
        else router.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (offline) return <OfflineView />;

  if (checking) {
    return (
      <div className={styles.shellWide}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shellWide}>
      <PageHeader app />
      <main className={styles.main}>
        <div style={{ padding: "0 4px" }}>
          <div className={styles.eyebrow} style={{ marginBottom: 4 }}>
            {t(hello)}
          </div>
          <h1 className={styles.title} style={{ marginBottom: 0 }}>
            {name}
          </h1>
        </div>

        <GettingStarted />

        <section className={styles.card}>
          <Suspense fallback={<LoadingState text={t("Notizen werden geladen …")} />}>
            <FileBrowser />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
