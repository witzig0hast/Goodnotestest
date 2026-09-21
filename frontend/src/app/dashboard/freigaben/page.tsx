"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import {
  ApiError,
  fetchCurrentRepository,
  fetchMyShareLinks,
  revokeShareLink,
  type MyShareLink,
} from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import styles from "../../ui.module.css";

function describeItems(link: MyShareLink): string {
  if (link.items.length === 1) {
    const item = link.items[0];
    if (item.relativePath === "") return "Meine Notizen (alles)";
    return `${item.isDirectory ? "📁" : "📄"} ${item.relativePath}`;
  }
  return `${link.items.length} Objekte`;
}

export default function FreigabenPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<MyShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function load() {
    fetchMyShareLinks()
      .then((res) => setLinks(res.links))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Freigaben konnten nicht geladen werden.")
      );
  }

  useEffect(() => {
    fetchCurrentRepository()
      .then(() => load())
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleRevoke(id: string) {
    if (!window.confirm("Diesen Freigabe-Link wirklich widerrufen? Er funktioniert danach nicht mehr.")) {
      return;
    }
    setRevokingId(id);
    try {
      await revokeShareLink(id);
      setLinks((current) => current?.filter((l) => l.id !== id) ?? null);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Widerrufen ist fehlgeschlagen.");
    } finally {
      setRevokingId(null);
    }
  }

  if (checking || !links) {
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
          <div className={styles.eyebrow}>Verwaltung</div>
          <h1 className={styles.title}>Meine Freigabe-Links</h1>
          <p className={styles.subtitle}>
            Alle Links, die du erstellt hast — mit Aufrufzähler und der
            Möglichkeit, sie jederzeit wieder zu widerrufen.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          {links.length === 0 ? (
            <div className={styles.emptyState}>Du hast noch keine Freigabe-Links erstellt.</div>
          ) : (
            <div className={styles.fileList}>
              {links.map((link) => (
                <div className={styles.fileRow} key={link.id}>
                  <div className={styles.fileIcon}>🔗</div>
                  <div className={styles.fileMain}>
                    <span className={styles.fileNameText}>{describeItems(link)}</span>
                    <span className={styles.fileMeta}>
                      {link.viewCount} {link.viewCount === 1 ? "Aufruf" : "Aufrufe"} ·{" "}
                      {link.requiresPassword ? "Passwortgeschützt · " : ""}
                      {link.expired
                        ? "Abgelaufen"
                        : link.expiresAt
                          ? `Läuft ab am ${formatDate(link.expiresAt)}`
                          : "Läuft nie ab"}{" "}
                      · erstellt am {formatDate(link.createdAt)}
                    </span>
                  </div>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.smallButton}
                      onClick={() => handleRevoke(link.id)}
                      disabled={revokingId === link.id}
                    >
                      Widerrufen
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
