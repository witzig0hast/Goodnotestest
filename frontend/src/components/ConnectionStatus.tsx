"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWebdavStatus, type WebdavConnectionStatus } from "../lib/api";
import { formatRelative } from "../lib/format";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";

const FAST_POLL_MS = 4000;
const SLOW_POLL_MS = 30000;

// Live feedback while someone sets up GoodNotes: polls the server and
// says whether GoodNotes has signed in, failed (and why), or delivered
// its first backup — the step where new users most often get stuck.
export function ConnectionStatus({ onPasswordProblem }: { onPasswordProblem?: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<WebdavConnectionStatus | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      let next = FAST_POLL_MS;
      try {
        const s = await fetchWebdavStatus();
        if (stopped) return;
        setStatus(s);
        if (s.fileCount > 0) next = SLOW_POLL_MS;
      } catch {
        next = SLOW_POLL_MS;
      }
      if (!stopped) timer = setTimeout(poll, document.hidden ? SLOW_POLL_MS : next);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!status) {
    return (
      <div className={styles.connectionBox}>
        <span className={styles.spinner} />
        <span>{t("Verbindungsstatus wird geprüft …")}</span>
      </div>
    );
  }

  const errorIsNewer =
    status.lastError &&
    status.lastErrorAt &&
    (!status.lastSuccessAt || status.lastErrorAt > status.lastSuccessAt);

  if (status.fileCount > 0) {
    // Split around {format} so "PDF" can stay bold in either language.
    const formatSwitch = t("Stell in GoodNotes das Backup-Format auf {format} um.").split("{format}");
    return (
      <div className={styles.connectionBoxSuccess}>
        <span className={styles.connectionIcon}>✓</span>
        <div style={{ flex: 1 }}>
          <strong>{t("Verbunden!")}</strong>{" "}
          {t(status.fileCount === 1 ? t("{n} Datei ist angekommen") : t("{n} Dateien sind angekommen"), {
            n: status.fileCount,
          })}
          {status.lastSuccessAt
            ? ` · ${t("zuletzt {when}", { when: formatRelative(status.lastSuccessAt) })}`
            : ""}
          .
          {status.goodnotesFormatCount > 0 && (
            <div className={styles.connectionNote}>
              {t("{n} davon im GoodNotes-Format — die lassen sich hier nicht ansehen.", {
                n: status.goodnotesFormatCount,
              })}{" "}
              {formatSwitch[0]}
              <strong>{t("PDF")}</strong>
              {formatSwitch[1]}
            </div>
          )}
        </div>
        <Link href="/dashboard" className={styles.smallButtonAccent}>
          {t("Zu den Notizen")}
        </Link>
      </div>
    );
  }

  if (errorIsNewer) {
    const message =
      status.lastError === "wrong_password"
        ? t("GoodNotes hat sich gemeldet, aber das Passwort stimmt nicht.")
        : status.lastError === "unknown_user"
          ? t("GoodNotes hat sich gemeldet, aber der Benutzername stimmt nicht.")
          : status.lastError === "quota_exceeded"
            ? t("Dein Speicherplatz ist voll — GoodNotes konnte nicht alles sichern.")
            : t("GoodNotes hat sich gemeldet, aber dein Konto ist noch nicht freigeschaltet.");
    return (
      <div className={styles.connectionBoxError}>
        <span className={styles.connectionIcon}>!</span>
        <div style={{ flex: 1 }}>
          <strong>{message}</strong>
          <div className={styles.connectionNote}>
            {t("Versuch {when}. Prüfe die Angaben in GoodNotes", {
              when: formatRelative(status.lastErrorAt!),
            })}
            {status.lastError === "wrong_password" && onPasswordProblem && (
              <>
                {" "}
                — {t("oder")}{" "}
                <button type="button" className={styles.inlineLink} onClick={onPasswordProblem}>
                  {t("erzeuge ein neues Passwort")}
                </button>
              </>
            )}
            .
          </div>
        </div>
      </div>
    );
  }

  if (status.lastSuccessAt) {
    return (
      <div className={styles.connectionBox}>
        <span className={styles.statusDot} />
        <div>
          <strong>{t("GoodNotes ist angemeldet")}</strong> {t("— warte auf die ersten Dateien …")}
          <div className={styles.connectionNote}>
            {t("Tippe in GoodNotes auf „Jetzt sichern“, falls das Backup nicht von selbst startet.")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.connectionBox}>
      <span className={styles.statusDot} />
      <div>
        <strong>{t("Warte auf GoodNotes …")}</strong>
        <div className={styles.connectionNote}>
          {t(
            "Sobald du die Angaben in GoodNotes eingetragen hast, siehst du hier automatisch, ob es geklappt hat."
          )}
        </div>
      </div>
    </div>
  );
}
