"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import {
  ApiError,
  fetchShareInfo,
  shareDownloadUrl,
  unlockShareLink,
  type ShareInfo,
} from "../../../lib/api";
import styles from "../../ui.module.css";

export default function SharePage() {
  const params = useParams<{ linkId: string }>();
  const linkId = params.linkId;

  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShareInfo(linkId)
      .then(setInfo)
      .catch(() => setNotFound(true));
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
        err instanceof ApiError ? err.message : "Passwort konnte nicht geprüft werden."
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
            <h1 className={styles.title}>Link nicht gefunden</h1>
            <p className={styles.subtitle}>
              Dieser Link ist ungültig oder bereits abgelaufen. Bitte frage die
              Person, die ihn dir geschickt hat, um einen neuen.
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
            <p className={styles.hint}>Wird geladen …</p>
          </section>
        </main>
      </div>
    );
  }

  const canDownload = !info.requiresPassword || Boolean(token);

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Geteilt</div>
          <h1 className={styles.title}>
            {info.type === "folder" ? "📁" : info.type === "bundle" ? "🗂️" : "📄"} {info.name}
          </h1>
          <p className={styles.subtitle}>
            {info.type === "folder"
              ? "Dieser Ordner wurde mit dir geteilt und lässt sich als ZIP-Datei herunterladen."
              : info.type === "bundle"
                ? "Diese Objekte wurden mit dir geteilt und lassen sich als ZIP-Datei herunterladen."
                : "Diese Datei wurde mit dir geteilt."}
          </p>

          {info.type === "bundle" && info.items.length > 0 && (
            <ul className={styles.hint} style={{ marginBottom: 16, listStyle: "none", padding: 0 }}>
              {info.items.map((item) => (
                <li key={item.name}>
                  {item.type === "folder" ? "📁" : "📄"} {item.name}
                </li>
              ))}
            </ul>
          )}

          {info.requiresPassword && !token && (
            <form onSubmit={handleUnlock} style={{ marginBottom: 20 }}>
              {error && (
                <div className={styles.errorBox} style={{ marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <div className={styles.field} style={{ marginBottom: 16 }}>
                <label className={styles.label} htmlFor="sharePassword">
                  Dieser Link ist mit einem Passwort geschützt
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
                {unlocking ? "Wird geprüft …" : "Anzeigen"}
              </button>
            </form>
          )}

          {canDownload && (
            <a
              className={styles.button}
              href={shareDownloadUrl(linkId, token ?? undefined)}
              style={{ display: "inline-flex" }}
            >
              {info.type === "file" ? "Herunterladen" : "Als ZIP herunterladen"}
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
