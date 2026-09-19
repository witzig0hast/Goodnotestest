import styles from "../app/ui.module.css";

export function PageHeader() {
  return (
    <div className={styles.header}>
      <div className={styles.logoMark}>G</div>
      <div className={styles.logoText}>GoodShare</div>
    </div>
  );
}
