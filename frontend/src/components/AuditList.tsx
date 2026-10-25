"use client";

import type { AuditEntry } from "../lib/api";
import { auditLabel } from "../lib/audit-labels";
import { formatDateTime } from "../lib/format";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";
import { Icon } from "./Icon";

export function AuditList({ entries, showAccount = false }: { entries: AuditEntry[]; showAccount?: boolean }) {
  const t = useT();
  if (entries.length === 0) {
    return <div className={styles.emptyState}>{t("Noch keine Einträge.")}</div>;
  }
  return (
    <div className={styles.auditList}>
      {entries.map((e) => {
        const { icon, label } = auditLabel(e.action);
        return (
          <div key={e.id} className={styles.auditRow} data-warning={e.action === "login.failed" || undefined}>
            <span className={styles.auditIcon}><Icon name={icon} size={16} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.auditLabel}>
                {t(label)}
                {showAccount && e.repositoryName && (
                  <span className={styles.auditAccount}> · {e.repositoryName}</span>
                )}
              </div>
              {e.detail && <div className={styles.auditDetail}>{e.detail}</div>}
            </div>
            <div className={styles.auditTime}>
              {formatDateTime(e.createdAt)}
              {e.ip && <div>{e.ip}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
