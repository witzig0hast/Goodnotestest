"use client";

import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";

export function LoadingState({ text }: { text?: string }) {
  const t = useT();
  return (
    <div className={styles.loadingRow}>
      <span className={styles.spinner} />
      <span>{text ?? t("Wird geladen …")}</span>
    </div>
  );
}
