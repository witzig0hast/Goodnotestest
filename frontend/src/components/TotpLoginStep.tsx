"use client";

import { useState } from "react";
import { ApiError, loginWithTotp } from "../lib/api";
import { translate, useT } from "../lib/i18n";
import { Icon } from "./Icon";
import styles from "../app/ui.module.css";

// Second sign-in step when two-factor sign-in is on: the password was
// right, now the 6-digit code from the authenticator app.
export function TotpLoginStep({
  ticket,
  onDone,
  onCancel,
}: {
  ticket: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithTotp(ticket, code);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translate("Das hat nicht geklappt."));
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <div className={styles.eyebrow}>{t("Zwei-Faktor-Anmeldung")}</div>
      <h1 className={styles.title}>{t("Bestätigungscode")}</h1>
      <p className={styles.subtitle}>
        {t("Gib den 6-stelligen Code aus deiner Authenticator-App ein.")}
      </p>
      {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}
      <input
        className={styles.pinInput}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        autoFocus
        aria-label={t("Bestätigungscode")}
        style={{ width: "100%", marginBottom: 20 }}
      />
      <div className={styles.actionRowInline}>
        <button className={styles.button} type="submit" disabled={loading || code.length !== 6}>
          <Icon name="lock" size={16} /> {loading ? t("Wird geprüft …") : t("Anmelden")}
        </button>
        <button className={styles.buttonSecondary} type="button" onClick={onCancel}>
          {t("Zurück")}
        </button>
      </div>
      <p className={styles.hint} style={{ marginTop: 20 }}>
        {t("Kein Zugriff auf die App? Melde dich mit Konto-Kennung und Notfall-Code an und schalte die Zwei-Faktor-Anmeldung danach neu ein.")}
      </p>
    </form>
  );
}
