"use client";

import { useEffect, useState } from "react";
import { fetchAnnouncements, type Announcement } from "../lib/api";
import styles from "../app/ui.module.css";

const DISMISSED_KEY = "goodshare_dismissed_announcements";
const EXIT_ANIMATION_MS = 200;

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Nothing we can do if storage is unavailable — the banner just
    // reappears next time, which is harmless.
  }
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(readDismissed());
    fetchAnnouncements()
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => {});
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    // Play the slide-up/fade-out first, then actually drop it from state —
    // an instant removal would just make the banner pop out of existence.
    setLeaving((current) => new Set(current).add(id));
    setTimeout(() => {
      setDismissed((current) => {
        const next = new Set(current);
        next.add(id);
        rememberDismissed(next);
        return next;
      });
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, EXIT_ANIMATION_MS);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {visible.map((a) => (
        <div
          key={a.id}
          className={leaving.has(a.id) ? styles.announcementBarLeaving : styles.announcementBar}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 20px",
            background: "var(--accent-soft)",
            color: "var(--foreground)",
            borderBottom: "1px solid var(--border)",
            fontSize: 14,
          }}
        >
          <span style={{ flex: 1 }}>{a.message}</span>
          <button
            onClick={() => dismiss(a.id)}
            aria-label="Nachricht ausblenden"
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 4,
              transition: "transform 0.1s ease",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
