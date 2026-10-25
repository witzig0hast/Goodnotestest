"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBackupDays, type BackupDay } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";
import { LoadingState } from "./LoadingState";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";

const WEEKS = 26;
const WEEKDAYS = ["Mo", "", "Mi", "", "Fr", "", "So"];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function level(uploads: number): number {
  if (uploads === 0) return 0;
  if (uploads < 3) return 1;
  if (uploads < 10) return 2;
  if (uploads < 30) return 3;
  return 4;
}

// A GitHub-style heatmap of the last half year: one square per day,
// darker the more files GoodNotes uploaded — gaps in the backup routine
// jump out immediately.
export function BackupCalendar() {
  const t = useT();
  const [days, setDays] = useState<BackupDay[] | null>(null);

  useEffect(() => {
    fetchBackupDays(WEEKS * 7)
      .then((res) => setDays(res.days))
      .catch(() => setDays([]));
  }, []);

  const grid = useMemo(() => {
    const byDay = new Map((days ?? []).map((d) => [d.day, d]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // Start on the Monday WEEKS-1 weeks before this week's Monday.
    const weekday = (today.getUTCDay() + 6) % 7;
    const start = new Date(today);
    start.setUTCDate(today.getUTCDate() - weekday - (WEEKS - 1) * 7);
    const weeks: { day: string; uploads: number; future: boolean }[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + w * 7 + d);
        const key = isoDay(date);
        week.push({ day: key, uploads: byDay.get(key)?.uploads ?? 0, future: date > today });
      }
      weeks.push(week);
    }
    return weeks;
  }, [days]);

  const summary = useMemo(() => {
    if (!days) return null;
    const active = days.filter((d) => d.uploads > 0);
    const last = active.length ? active[active.length - 1] : null;
    let longestGap = 0;
    for (let i = 1; i < active.length; i++) {
      const gap =
        (new Date(active[i].day).getTime() - new Date(active[i - 1].day).getTime()) / 86_400_000 - 1;
      longestGap = Math.max(longestGap, gap);
    }
    return { activeDays: active.length, last, longestGap };
  }, [days]);

  if (!days) return <LoadingState />;

  return (
    <div>
      <div className={styles.statsTiles}>
        <div className={styles.statTile}>
          <div className={styles.statTileValue}>
            {summary?.last ? formatRelative(summary.last.lastUploadAt) : "—"}
          </div>
          <div className={styles.statTileLabel}>{t("Letztes Backup")}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statTileValue}>{summary?.activeDays ?? 0}</div>
          <div className={styles.statTileLabel}>{t("Tage mit Backup (½ Jahr)")}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statTileValue}>
            {summary && summary.activeDays > 1 ? t(summary.longestGap === 1 ? "{n} Tag" : "{n} Tage", { n: summary.longestGap }) : "—"}
          </div>
          <div className={styles.statTileLabel}>{t("Längste Lücke")}</div>
        </div>
      </div>
      <div className={styles.calendarScroll}>
        <div className={styles.calendar}>
          <div className={styles.calendarWeekdays}>
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d ? t(d) : d}</span>
            ))}
          </div>
          {grid.map((week, w) => (
            <div key={w} className={styles.calendarWeek}>
              {week.map((cell) => (
                <span
                  key={cell.day}
                  className={styles.calendarCell}
                  data-level={cell.future ? "future" : level(cell.uploads)}
                  title={
                    cell.future
                      ? ""
                      : `${formatDate(cell.day)}: ${
                          cell.uploads === 0
                            ? t("kein Backup")
                            : cell.uploads === 1
                              ? t("{n} Datei gesichert", { n: cell.uploads })
                              : t("{n} Dateien gesichert", { n: cell.uploads })
                        }`
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.calendarLegend}>
        {t("weniger")}
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={styles.calendarCell} data-level={l} />
        ))}
        {t("mehr")}
      </div>
      {days.length === 0 && (
        <p className={styles.hint} style={{ marginTop: 12 }}>
          {t("Noch keine Backups aufgezeichnet. Sobald GoodNotes Dateien schickt, füllt sich der Kalender.")}
        </p>
      )}
    </div>
  );
}
