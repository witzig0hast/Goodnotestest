"use client";

import { useEffect, useState } from "react";
import { fetchRecentViews, type RecentView } from "../lib/api";
import { formatRelative } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import styles from "../app/ui.module.css";

// "Zuletzt angesehen": the last opened notes as a horizontal strip, each
// reopening the viewer where you left off.
export function RecentStrip({ onOpen }: { onOpen: (path: string, page: number) => void }) {
  const t = useT();
  const [items, setItems] = useState<RecentView[] | null>(null);

  useEffect(() => {
    fetchRecentViews(8)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className={styles.stripHeading}>{t("Zuletzt angesehen")}</div>
      <div className={styles.recentStrip}>
        {items.map((item) => {
          const name = item.path.split("/").pop()!.replace(/\.pdf$/i, "");
          const progress = item.pageCount ? item.lastPage / item.pageCount : null;
          return (
            <button
              key={item.path}
              type="button"
              className={styles.recentCard}
              onClick={() => onOpen(item.path, item.lastPage)}
              title={item.path}
            >
              <span className={styles.recentIcon}>
                <Icon name="file" size={16} />
              </span>
              <span className={styles.recentName}>{name}</span>
              <span className={styles.recentMeta}>
                {item.pageCount
                  ? t("Seite {page} von {count}", { page: item.lastPage, count: item.pageCount })
                  : t("Seite {page}", { page: item.lastPage })}{" "}
                · {formatRelative(item.viewedAt)}
              </span>
              {progress !== null && (
                <span className={styles.recentProgress}>
                  <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
