"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWebdavStatus, type WebdavConnectionStatus } from "../lib/api";
import { formatRelative } from "../lib/format";
import styles from "../app/ui.module.css";

const FAST_POLL_MS = 4000;
const SLOW_POLL_MS = 30000;

// Live feedback while someone sets up GoodNotes: polls the server and
// says whether GoodNotes has signed in, failed (and why), or delivered
// its first backup — the step where new users most often get stuck.
export function ConnectionStatus({ onPasswordProblem }: { onPasswordProblem?: () => void }) {
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
        <span>Verbindungsstatus wird geprüft …</span>
      </div>
    );
  }

  const errorIsNewer =
    status.lastError &&
    status.lastErrorAt &&
    (!status.lastSuccessAt || status.lastErrorAt > status.lastSuccessAt);

  if (status.fileCount > 0) {
    return (
      <div className={styles.connectionBoxSuccess}>
        <span className={styles.connectionIcon}>✓</span>
        <div style={{ flex: 1 }}>
          <strong>Verbunden!</strong> {status.fileCount}{" "}
          {status.fileCount === 1 ? "Datei ist" : "Dateien sind"} angekommen
          {status.lastSuccessAt ? ` · zuletzt ${formatRelative(status.lastSuccessAt)}` : ""}.
          {status.goodnotesFormatCount > 0 && (
            <div className={styles.connectionNote}>
              ⚠️ {status.goodnotesFormatCount} davon im GoodNotes-Format — die lassen sich hier
              nicht ansehen. Stell in GoodNotes das Backup-Format auf <strong>PDF</strong> um.
            </div>
          )}
        </div>
        <Link href="/dashboard" className={styles.smallButtonAccent}>
          Zu den Notizen
        </Link>
      </div>
    );
  }

  if (errorIsNewer) {
    const message =
      status.lastError === "wrong_password"
        ? "GoodNotes hat sich gemeldet, aber das Passwort stimmt nicht."
        : status.lastError === "unknown_user"
          ? "GoodNotes hat sich gemeldet, aber der Benutzername stimmt nicht."
          : "GoodNotes hat sich gemeldet, aber dein Konto ist noch nicht freigeschaltet.";
    return (
      <div className={styles.connectionBoxError}>
        <span className={styles.connectionIcon}>!</span>
        <div style={{ flex: 1 }}>
          <strong>{message}</strong>
          <div className={styles.connectionNote}>
            Versuch {formatRelative(status.lastErrorAt!)}. Prüfe die Angaben in GoodNotes
            {status.lastError === "wrong_password" && onPasswordProblem && (
              <>
                {" "}
                — oder{" "}
                <button type="button" className={styles.inlineLink} onClick={onPasswordProblem}>
                  erzeuge ein neues Passwort
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
          <strong>GoodNotes ist angemeldet</strong> — warte auf die ersten Dateien …
          <div className={styles.connectionNote}>
            Tippe in GoodNotes auf „Jetzt sichern“, falls das Backup nicht von selbst startet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.connectionBox}>
      <span className={styles.statusDot} />
      <div>
        <strong>Warte auf GoodNotes …</strong>
        <div className={styles.connectionNote}>
          Sobald du die Angaben in GoodNotes eingetragen hast, siehst du hier automatisch, ob es
          geklappt hat.
        </div>
      </div>
    </div>
  );
}
