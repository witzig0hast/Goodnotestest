import styles from "../app/ui.module.css";

export function LoadingState({ text = "Wird geladen …" }: { text?: string }) {
  return (
    <div className={styles.loadingRow}>
      <span className={styles.spinner} />
      <span>{text}</span>
    </div>
  );
}
