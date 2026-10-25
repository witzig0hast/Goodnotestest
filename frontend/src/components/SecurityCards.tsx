"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  ApiError,
  disableTotp,
  enableTotp,
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
  startTotpSetup,
  type SessionInfo,
} from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import { translate, useT } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";
import styles from "../app/ui.module.css";

/** "Safari auf iPhone" from a user-agent string — good enough to recognise your devices. */
export function describeAgent(ua: string | null): { label: string; icon: IconName } {
  if (!ua) return { label: translate("Unbekanntes Gerät"), icon: "monitor" };
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  const label =
    browser && os
      ? translate("{browser} auf {os}", { browser, os })
      : (browser ?? os ?? translate("Unbekanntes Gerät"));
  const mobile = os === "iPhone" || os === "Android" || os === "iPad";
  return { label, icon: mobile ? "smartphone" : "monitor" };
}

const METHOD_LABELS: Record<string, string> = {
  password: "Passwort",
  "password+2fa": "Passwort + Code",
  passkey: "Passkey",
  code: "Notfall-Code",
  sso: "Single Sign-On",
  signup: "Registrierung",
};

export function SessionsCard() {
  const t = useT();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    fetchSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }

  useEffect(load, []);

  async function revoke(id: string) {
    setSessions((list) => list?.filter((s) => s.id !== id) ?? null);
    await revokeSession(id).catch(() => load());
  }

  async function revokeOthers() {
    if (!window.confirm(t("Alle anderen Geräte abmelden? Dort musst du dich danach neu anmelden."))) return;
    const r = await revokeOtherSessions().catch(() => null);
    if (r) setMessage(t("{n} Geräte abgemeldet.", { n: r.signedOut }));
    load();
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <section className={styles.card}>
      <div className={styles.toolbar} style={{ alignItems: "flex-start" }}>
        <div>
          <h2 className={styles.sectionTitle}>{t("Angemeldete Geräte")}</h2>
          <p className={styles.hint}>
            {t("Hier bist du gerade angemeldet. Ein Gerät, das du nicht kennst? Melde es ab und ändere dein Passwort.")}
          </p>
        </div>
        {others > 0 && (
          <button className={styles.smallButton} onClick={revokeOthers}>
            {t("Alle anderen abmelden")}
          </button>
        )}
      </div>
      {message && <div className={styles.statusBadge} style={{ marginBottom: 12 }}>{message}</div>}
      {!sessions ? null : (
        <div className={styles.fileList}>
          {sessions.map((s) => {
            const device = describeAgent(s.userAgent);
            return (
              <div key={s.id} className={styles.fileRow}>
                <div className={styles.fileIcon}><Icon name={device.icon} /></div>
                <div className={styles.fileMain}>
                  <span className={styles.fileNameText}>
                    {device.label}
                    {s.current && <span className={styles.currentBadge}>{t("Dieses Gerät")}</span>}
                  </span>
                  <span className={styles.fileMeta}>
                    {s.method ? `${t(METHOD_LABELS[s.method] ?? s.method)} · ` : ""}
                    {t("seit {date}", { date: formatDateTime(s.createdAt) })} ·{" "}
                    {t("zuletzt aktiv {when}", { when: formatRelative(s.lastSeenAt) })}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </span>
                </div>
                {!s.current && (
                  <button className={styles.smallButton} onClick={() => revoke(s.id)}>
                    {t("Abmelden")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TwoFactorCard({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  const t = useT();
  const [setup, setSetup] = useState<{ secret: string; setupToken: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const s = await startTotpSetup();
      const qr = await QRCode.toDataURL(s.otpauthUrl, { width: 200, margin: 1 });
      setSetup({ secret: s.secret, setupToken: s.setupToken, qr });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setup) {
        await enableTotp(setup.setupToken, code);
        setSetup(null);
        onChange(true);
      } else {
        await disableTotp(code);
        setDisabling(false);
        onChange(false);
      }
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  const codeForm = (label: string) => (
    <form onSubmit={confirm} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <input
        className={styles.input}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        style={{ width: 150, letterSpacing: "0.2em", textAlign: "center" }}
        aria-label={t("Bestätigungscode")}
        autoFocus
      />
      <button className={styles.button} type="submit" disabled={busy || code.length !== 6}>
        {label}
      </button>
    </form>
  );

  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>
        {t("Zwei-Faktor-Anmeldung")}{" "}
        {enabled && <span className={styles.currentBadge}>{t("Aktiv")}</span>}
      </h2>
      <p className={styles.hint} style={{ marginBottom: 12 }}>
        {t("Zusätzlich zum Passwort fragt GoodShare nach einem 6-stelligen Code aus einer Authenticator-App (z. B. Google Authenticator, 1Password, Aegis). Anmelden per Passkey bleibt ohne Code möglich.")}
      </p>
      {error && <div className={styles.errorBox} style={{ marginBottom: 12 }}>{error}</div>}

      {enabled ? (
        disabling ? (
          <>
            <p className={styles.hint}>{t("Zum Ausschalten den aktuellen Code eingeben:")}</p>
            {codeForm(t("Ausschalten"))}
          </>
        ) : (
          <button className={styles.smallButton} onClick={() => setDisabling(true)}>
            {t("Zwei-Faktor-Anmeldung ausschalten")}
          </button>
        )
      ) : setup ? (
        <div className={styles.qrRow} style={{ alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URL */}
          <img src={setup.qr} alt={t("QR-Code für die Authenticator-App")} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <ol className={styles.hint} style={{ paddingLeft: 18, fontSize: 14 }}>
              <li>{t("Scanne den QR-Code mit deiner Authenticator-App.")}</li>
              <li>
                {t("Oder gib den Schlüssel von Hand ein:")} <code className={styles.inlineCode}>{setup.secret}</code>
              </li>
              <li>{t("Tippe den Code ein, den die App jetzt anzeigt:")}</li>
            </ol>
            {codeForm(t("Einschalten"))}
          </div>
        </div>
      ) : (
        <button className={styles.button} onClick={begin} disabled={busy}>
          <Icon name="lock" size={16} /> {t("Zwei-Faktor-Anmeldung einrichten")}
        </button>
      )}
    </section>
  );
}
