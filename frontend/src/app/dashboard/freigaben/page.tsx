"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import { UploadLinkList } from "../../../components/UploadLinkList";
import {
  ApiError,
  fetchCurrentRepository,
  fetchMyShareLinks,
  revokeShareLink,
  type MyShareLink,
} from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { useT, type Translate } from "../../../lib/i18n";
import styles from "../../ui.module.css";
import { Icon } from "../../../components/Icon";

function describeItems(link: MyShareLink, t: Translate): string {
  if (link.items.length === 1) {
    const item = link.items[0];
    if (item.relativePath === "") return t("Meine Notizen (alles)");
    return item.relativePath;
  }
  return t("{n} Objekte", { n: link.items.length });
}

export default function FreigabenPage() {
  const t = useT();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [links, setLinks] = useState<MyShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function load() {
    fetchMyShareLinks()
      .then((res) => setLinks(res.links))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t("Freigaben konnten nicht geladen werden."))
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
    if (!window.confirm(t("Diesen Freigabe-Link wirklich widerrufen? Er funktioniert danach nicht mehr."))) {
      return;
    }
    setRevokingId(id);
    try {
      await revokeShareLink(id);
      setLinks((current) => current?.filter((l) => l.id !== id) ?? null);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : t("Widerrufen ist fehlgeschlagen."));
    } finally {
      setRevokingId(null);
    }
  }

  if (checking || !links) {
    return (
      <div className={styles.shell}>
        <PageHeader app />
        <main className={styles.main}>
          <Link href="/dashboard" className={styles.backLink}>
            {t("← Zurück zu meinen Notizen")}
          </Link>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader app />
      <main className={styles.main}>
        <Link href="/dashboard" className={styles.backLink}>
          {t("← Zurück zu meinen Notizen")}
        </Link>
        <section className={styles.card}>
          <div className={styles.eyebrow}>{t("Verwaltung")}</div>
          <h1 className={styles.title}>{t("Meine Freigaben")}</h1>
          <p className={styles.subtitle}>
            {t("Alle Links, die du erstellt hast — mit Aufrufzähler und der Möglichkeit, sie jederzeit wieder zu widerrufen.")}
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          {links.length === 0 ? (
            <div className={styles.emptyState}>{t("Du hast noch keine Freigabe-Links erstellt.")}</div>
          ) : (
            <div className={styles.fileList}>
              {links.map((link) => (
                <div className={styles.fileRow} key={link.id}>
                  <div className={styles.fileIcon}><Icon name="link" /></div>
                  <div className={styles.fileMain}>
                    <span className={styles.fileNameText}>{describeItems(link, t)}</span>
                    <span className={styles.fileMeta}>
                      {link.maxDownloads !== null
                        ? t("{used} von {max} Abrufen", { used: link.downloadCount, max: link.maxDownloads })
                        : link.viewCount === 1
                          ? t("{n} Aufruf", { n: link.viewCount })
                          : t("{n} Aufrufe", { n: link.viewCount })}{" "}
                      ·{" "}
                      {link.exhausted ? `${t("Limit erreicht")} · ` : ""}
                      {link.notifyOnOpen ? `${t("Benachrichtigung an")} · ` : ""}
                      {link.requiresPassword ? `${t("Passwortgeschützt")} · ` : ""}
                      {link.expired
                        ? t("Abgelaufen")
                        : link.expiresAt
                          ? t("Läuft ab am {date}", { date: formatDate(link.expiresAt) })
                          : t("Läuft nie ab")}{" "}
                      · {t("erstellt am {date}", { date: formatDate(link.createdAt) })}
                    </span>
                  </div>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.smallButton}
                      onClick={() => handleRevoke(link.id)}
                      disabled={revokingId === link.id}
                    >
                      {t("Widerrufen")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>{t("Upload-Links")}</h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            {t("Über diese Links können andere dir Dateien in einen Ordner schicken.")}
          </p>
          <UploadLinkList />
        </section>
      </main>
    </div>
  );
}
