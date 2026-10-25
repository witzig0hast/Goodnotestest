"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import {
  ApiError,
  fetchCurrentRepository,
  regenerateWebdavPassword,
  type SessionResponse,
} from "../../../lib/api";
import QRCode from "qrcode";
import { ConnectionStatus } from "../../../components/ConnectionStatus";
import styles from "../../ui.module.css";
import { translate, useT } from "../../../lib/i18n";

export default function WebdavPage() {
  const t = useT();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/dashboard/webdav`, { width: 240, margin: 1 })
      .then(setQrCodeUrl)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCurrentRepository()
      .then(setSession)
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    } catch {
      // the value is still visible on screen, so this is not fatal
    }
  }

  async function handleRegenerate() {
    if (
      !window.confirm(
        translate("Ein neues WebDAV-Passwort erzeugen? Das alte Passwort funktioniert danach sofort nicht mehr — GoodNotes muss dann mit dem neuen Passwort neu eingerichtet werden.")
      )
    ) {
      return;
    }
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await regenerateWebdavPassword();
      setNewPassword(res.password);
    } catch (err) {
      setRegenerateError(
        err instanceof ApiError ? err.message : translate("Das hat nicht geklappt. Bitte nochmal versuchen.")
      );
    } finally {
      setRegenerating(false);
    }
  }

  if (checking || !session) {
    return (
      <div className={styles.shell}>
        <PageHeader app />
        <main className={styles.main}>
          <Link href="/dashboard" className={styles.backLink}>
            {t("← Zurück zu meinen Notizen")}
          </Link>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  const webdavUrl = `${
    process.env.NEXT_PUBLIC_WEBDAV_URL ?? "http://localhost:4000"
  }/webdav/${session.repositoryId}`;

  return (
    <div className={styles.shell}>
      <PageHeader app />
      <main className={styles.main}>
        <Link href="/dashboard" className={styles.backLink}>
          {t("← Zurück zu meinen Notizen")}
        </Link>
        <section className={styles.card}>
          <div className={styles.eyebrow}>{t("Einstellungen")}</div>
          <h1 className={styles.title}>{t("GoodNotes verbinden")}</h1>
          <p className={styles.subtitle}>
            {t("Diese Angaben brauchst du, um GoodNotes auf einem (weiteren) Gerät einzurichten — jederzeit hier nachzuschlagen, nicht nur bei der Kontoerstellung.")}
          </p>

          <div className={styles.secretGrid}>
            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>
                {t("WebDAV-Adresse (für GoodNotes → Einstellungen → Backup)")}
              </span>
              <div className={styles.secretValue}>
                <span>{webdavUrl}</span>
                <button
                  className={copiedField === "url" ? styles.copyButtonCopied : styles.copyButton}
                  onClick={() => copy("url", webdavUrl)}
                >
                  {copiedField === "url" ? t("Kopiert") : t("Kopieren")}
                </button>
              </div>
            </div>

            <div className={styles.secretItem}>
              <span className={styles.secretLabel}>{t("WebDAV-Benutzername")}</span>
              <div className={styles.secretValue}>
                <span>{session.webdavUsername}</span>
                <button
                  className={copiedField === "user" ? styles.copyButtonCopied : styles.copyButton}
                  onClick={() => copy("user", session.webdavUsername)}
                >
                  {copiedField === "user" ? t("Kopiert") : t("Kopieren")}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <ConnectionStatus
              onPasswordProblem={() =>
                document.getElementById("passwort")?.scrollIntoView({ behavior: "smooth" })
              }
            />
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            {t("So richtest du GoodNotes ein")}
          </h2>
          <div className={styles.stepList}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepText}>
                {t("Öffne GoodNotes auf dem iPad oder iPhone und gehe zu")}{" "}
                <strong>{t("Einstellungen → Backup")}</strong>{t(". Schalte „Auto-Backup“ ein und wähle als Ziel")} <strong>{t("WebDAV")}</strong>.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepText}>
                {t("Trage die Adresse und den Benutzernamen von oben ein, dazu dein WebDAV-Passwort (das kennst du nur, wenn du es dir notiert hast oder gleich unten ein neues erzeugst).")}
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepText}>
                {t("Stell das")} <strong>{t("Backup-Format auf „PDF“")}</strong> {t("— nur dann kannst du deine Notizen hier ansehen und durchsuchen.")}
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepText}>
                {t("Tippe auf „Jetzt sichern“. Oben siehst du sofort, ob es geklappt hat.")}
              </div>
            </div>
          </div>
        </section>

        {qrCodeUrl && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("Direkt auf dem iPad einrichten")}</h2>
            <div className={styles.qrRow} style={{ marginTop: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URL */}
              <img src={qrCodeUrl} alt={t("QR-Code zu dieser Seite")} />
              <p className={styles.hint} style={{ flex: 1, minWidth: 200, fontSize: 14 }}>
                {t("Abtippen ist mühsam: Scanne den Code mit der Kamera des iPads, um diese Seite dort zu öffnen. Dann kannst du Adresse, Benutzername und Passwort einfach kopieren und in GoodNotes einfügen.")}
              </p>
            </div>
          </section>
        )}

        <section className={styles.card} id="passwort">
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
            {t("WebDAV-Passwort vergessen?")}
          </h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            {t("Das Passwort selbst wird aus Sicherheitsgründen nirgendwo gespeichert — es wurde dir nur einmal direkt nach dem Erstellen des Kontos angezeigt. Falls du es nicht mehr hast, erzeug hier ein neues (das alte funktioniert danach nicht mehr).")}
          </p>

          {regenerateError && (
            <div className={styles.errorBox} style={{ marginBottom: 16 }}>
              {regenerateError}
            </div>
          )}

          {newPassword ? (
            <div className={styles.secretGrid}>
              <div className={`${styles.secretItem} ${styles.onlyOnceItem}`}>
                <span className={styles.secretLabel}>
                  {t("Neues WebDAV-Passwort")}
                  <span className={styles.onlyOnceBadge}>{t("Nur jetzt sichtbar")}</span>
                </span>
                <div className={styles.secretValue}>
                  <span>{newPassword}</span>
                  <button
                    className={
                      copiedField === "newPassword" ? styles.copyButtonCopied : styles.copyButton
                    }
                    onClick={() => copy("newPassword", newPassword)}
                  >
                    {copiedField === "newPassword" ? t("Kopiert") : t("Kopieren")}
                  </button>
                </div>
                <span className={styles.hint} style={{ marginTop: 4 }}>
                  {t("Jetzt in GoodNotes eintragen — dieses Passwort wird danach nirgendwo mehr angezeigt.")}
                </span>
              </div>
            </div>
          ) : (
            <button className={styles.button} onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? t("Wird erzeugt …") : t("Neues Passwort erzeugen")}
            </button>
          )}
        </section>

      </main>
    </div>
  );
}
