"use client";

import { useEffect, useState } from "react";
import { AuthedPage } from "../../../components/AuthedPage";
import { BackupCalendar } from "../../../components/BackupCalendar";
import { AuditList } from "../../../components/AuditList";
import { LoadingState } from "../../../components/LoadingState";
import { fetchActivityLog, type AuditEntry } from "../../../lib/api";
import styles from "../../ui.module.css";

function ActivityLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    fetchActivityLog()
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]));
  }, []);
  return entries ? <AuditList entries={entries} /> : <LoadingState />;
}

export default function AktivitaetPage() {
  return (
    <AuthedPage>
      {() => (
        <>
          <section className={styles.card}>
            <div className={styles.eyebrow}>Einstellungen</div>
            <h1 className={styles.title}>Aktivität</h1>
            <p className={styles.subtitle}>
              Wann GoodNotes gesichert hat — und was in deinem Konto passiert ist.
            </p>
            <h2 className={styles.sectionTitle} style={{ marginBottom: 12 }}>
              Backup-Kalender
            </h2>
            <BackupCalendar />
          </section>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Protokoll</h2>
            <p className={styles.hint} style={{ marginBottom: 16 }}>
              Anmeldungen, Freigaben und Änderungen der letzten 6 Monate. Ein
              fehlgeschlagener Anmeldeversuch, den du nicht selbst warst? Dann
              ändere am besten dein Passwort.
            </p>
            <ActivityLog />
          </section>
        </>
      )}
    </AuthedPage>
  );
}
