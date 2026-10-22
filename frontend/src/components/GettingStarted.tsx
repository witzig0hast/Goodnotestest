"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMyShareLinks, fetchPasskeyCount, fetchStats } from "../lib/api";
import { hasSeenTour, openTour, TOUR_CLOSED_EVENT } from "./WelcomeTour";
import styles from "../app/ui.module.css";

const DISMISSED_KEY = "goodshare.gettingStartedDismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface Progress {
  tourSeen: boolean;
  connected: boolean;
  passkey: boolean;
  shared: boolean;
}

// A short "Erste Schritte" checklist on the dashboard: shows a new user
// what's left to set up, ticks items off from real account state (not
// just clicks), and goes away once everything's done or it's dismissed.
export function GettingStarted() {
  const [dismissed, setDismissed] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    Promise.all([
      fetchStats().then((s) => s.totalFiles > 0).catch(() => false),
      fetchPasskeyCount().then((r) => r.count > 0).catch(() => false),
      fetchMyShareLinks().then((r) => r.links.length > 0).catch(() => false),
    ]).then(([connected, passkey, shared]) => {
      setDismissed(readDismissed());
      setProgress({ tourSeen: hasSeenTour(), connected, passkey, shared });
    });

    // The tour can be finished while this card is on screen — tick it off
    // right away instead of waiting for a reload.
    const markSeen = () => setProgress((p) => (p ? { ...p, tourSeen: true } : p));
    window.addEventListener(TOUR_CLOSED_EVENT, markSeen);
    return () => window.removeEventListener(TOUR_CLOSED_EVENT, markSeen);
  }, []);

  if (dismissed || !progress) return null;

  const items = [
    { done: true, label: "Konto erstellen" },
    {
      done: progress.tourSeen,
      label: "Kurze Einführung ansehen (1 Minute)",
      action: openTour,
    },
    {
      done: progress.connected,
      label: "GoodNotes verbinden und erstes Backup machen",
      href: "/dashboard/webdav",
    },
    {
      done: progress.passkey,
      label: "Passkey einrichten — Anmelden per Face ID / Fingerabdruck",
      href: "/dashboard/sicherheit",
    },
    {
      done: progress.shared,
      label: "Eine Notiz per Link teilen (über „⋯“ → Teilen)",
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // not fatal
    }
    setDismissed(true);
  }

  return (
    <section className={styles.card}>
      <div className={styles.toolbar} style={{ marginBottom: 0 }}>
        <div>
          <div className={styles.eyebrow} style={{ marginBottom: 4 }}>
            Erste Schritte
          </div>
          <h2 className={styles.sectionTitle}>
            {doneCount} von {items.length} erledigt
          </h2>
        </div>
        <button type="button" className={styles.smallButton} onClick={dismiss}>
          Ausblenden
        </button>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>
      <div className={styles.checklist}>
        {items.map((item) => {
          const content = (
            <>
              <span className={item.done ? styles.checkCircleDone : styles.checkCircle}>
                {item.done ? "✓" : ""}
              </span>
              <span className={item.done ? styles.checklistTextDone : styles.checklistText}>
                {item.label}
              </span>
              {!item.done && (item.href || item.action) && (
                <span className={styles.checklistArrow}>→</span>
              )}
            </>
          );
          if (!item.done && item.href) {
            return (
              <Link key={item.label} href={item.href} className={styles.checklistItem}>
                {content}
              </Link>
            );
          }
          if (!item.done && item.action) {
            return (
              <button
                key={item.label}
                type="button"
                className={styles.checklistItem}
                onClick={item.action}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={item.label} className={styles.checklistItem}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
