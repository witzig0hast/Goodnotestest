"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchCurrentRepository, type SessionResponse } from "../lib/api";
import { LoadingState } from "./LoadingState";
import { PageHeader } from "./PageHeader";
import styles from "../app/ui.module.css";

/**
 * Shell for a page behind the login: checks the session (redirecting to
 * /login without one), renders the app header and a way back to the
 * notes, and only renders `children` once the session is known.
 */
export function AuthedPage({
  wide = false,
  requireAdmin = false,
  children,
}: {
  wide?: boolean;
  requireAdmin?: boolean;
  children: (session: SessionResponse) => React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    fetchCurrentRepository()
      .then((s) => {
        if (requireAdmin && !s.isAdmin) router.replace("/dashboard");
        else setSession(s);
      })
      .catch(() => router.replace("/login"));
  }, [router, requireAdmin]);

  return (
    <div className={wide ? styles.shellWide : styles.shell}>
      <PageHeader app />
      <main className={styles.main}>
        <Link href="/dashboard" className={styles.backLink}>
          ← Zurück zu meinen Notizen
        </Link>
        {session ? (
          children(session)
        ) : (
          <section className={styles.card}>
            <LoadingState />
          </section>
        )}
      </main>
    </div>
  );
}
