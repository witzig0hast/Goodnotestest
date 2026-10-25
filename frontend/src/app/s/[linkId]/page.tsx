"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import { PdfViewer } from "../../../components/PdfViewer";
import {
  ApiError,
  fetchShareInfo,
  shareDownloadUrl,
  unlockShareLink,
  type ShareInfo,
} from "../../../lib/api";
import { translate, useT } from "../../../lib/i18n";
import styles from "../../ui.module.css";
import { Icon } from "../../../components/Icon";

export default function SharePage() {
  const t = useT();
  const params = useParams<{ linkId: string }>();
  const linkId = params.linkId;

  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    fetchShareInfo(linkId)
      .then(setInfo)
      .catch((err) => {
        setNotFound(true);
        if (err instanceof ApiError && /abgerufen/.test(err.message)) setLimitReached(true);
      });
  }, [linkId]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setError(null);
    try {
      const res = await unlockShareLink(linkId, password);
      setToken(res.token);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : translate("Passwort konnte nicht geprüft werden.")
      );
    } finally {
      setUnlocking(false);
    }
  }

  if (notFound) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <div className={styles.emptyIllustration}><Icon name={limitReached ? "ban" : "link"} size={40} strokeWidth={1.4} /></div>
            <h1 className={styles.title}>
              {limitReached ? t("Download-Limit erreicht") : t("Link nicht gefunden")}
            </h1>
            <p className={styles.subtitle}>
              {limitReached
                ? t("Dieser Link wurde schon so oft abgerufen, wie die Person, die ihn geteilt hat, erlaubt hat.")
                : t("Dieser Link ist ungültig oder bereits abgelaufen.")}{" "}
              {t("Bitte frage die Person, die ihn dir geschickt hat, um einen neuen.")}
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (!info) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  const canDownload = !info.requiresPassword || Boolean(token);
  const isViewablePdf = info.type === "file" && info.name.toLowerCase().endsWith(".pdf");

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>{t("Geteilt")}</div>
          <h1 className={styles.title}>
            <Icon name={info.type === "file" ? "file" : "folder"} size={26} style={{ marginRight: 6, marginTop: -4 }} />{info.name}
          </h1>
          <p className={styles.subtitle}>
            {info.type === "folder"
              ? t("Dieser Ordner wurde mit dir geteilt und lässt sich als ZIP-Datei herunterladen.")
              : info.type === "bundle"
                ? t("Diese Objekte wurden mit dir geteilt und lassen sich als ZIP-Datei herunterladen.")
                : t("Diese Datei wurde mit dir geteilt.")}
          </p>

          {info.type === "bundle" && info.items.length > 0 && (
            <ul className={styles.hint} style={{ marginBottom: 16, listStyle: "none", padding: 0 }}>
              {info.items.map((item) => (
                <li key={item.name}>
                  <Icon name={item.type === "folder" ? "folder" : "file"} size={14} style={{ marginRight: 6 }} />{item.name}
                </li>
              ))}
            </ul>
          )}

          {info.requiresPassword && !token && (
            <form onSubmit={handleUnlock} style={{ marginBottom: 20 }}>
              {error && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {t(error)}
                </div>
              )}
              <div className={styles.field} style={{ marginBottom: 16 }}>
                <label className={styles.label} htmlFor="sharePassword">
                  {t("Dieser Link ist mit einem Passwort geschützt")}
                </label>
                <input
                  id="sharePassword"
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <button className={styles.button} type="submit" disabled={unlocking}>
                {unlocking ? t("Wird geprüft …") : t("Anzeigen")}
              </button>
            </form>
          )}

          {canDownload && info.downloadsLeft !== null && (
            <p className={styles.hint} style={{ marginBottom: 12 }}>
              {t(info.downloadsLeft === 1 ? t("Noch {n} Abruf möglich") : t("Noch {n} Abrufe möglich"), {
                n: info.downloadsLeft,
              })}
              {isViewablePdf ? ` ${t("(Ansehen zählt auch)")}` : ""}.
            </p>
          )}
          {canDownload && (
            <div className={styles.actionRowInline}>
              {isViewablePdf && (
                <button className={styles.button} onClick={() => setViewing(true)}>
                  {t("Ansehen")}
                </button>
              )}
              <a
                className={isViewablePdf ? styles.buttonSecondary : styles.button}
                href={shareDownloadUrl(linkId, token ?? undefined)}
              >
                {info.type === "file" ? t("Herunterladen") : t("Als ZIP herunterladen")}
              </a>
            </div>
          )}
          {viewing && (
            <PdfViewer
              url={shareDownloadUrl(linkId, token ?? undefined)}
              title={info.name}
              downloadUrl={shareDownloadUrl(linkId, token ?? undefined)}
              onClose={() => setViewing(false)}
            />
          )}
        </section>
      </main>
    </div>
  );
}
