"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthedPage } from "../../../components/AuthedPage";
import { LoadingState } from "../../../components/LoadingState";
import {
  ApiError,
  deleteTrashItem,
  emptyTrash,
  fetchTrash,
  restoreTrashItem,
  type TrashItem,
} from "../../../lib/api";
import { formatDateTime, formatFileSize } from "../../../lib/format";
import styles from "../../ui.module.css";

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function TrashList() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrash()
      .then((res) => {
        setItems(res.items);
        setRetentionDays(res.retentionDays);
      })
      .catch(() => setError("Der Papierkorb konnte nicht geladen werden."));
  }, []);

  async function handleRestore(item: TrashItem) {
    setBusyId(item.id);
    setError(null);
    try {
      const { path } = await restoreTrashItem(item.id);
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      setMessage({
        text:
          path === item.originalPath
            ? `„${item.name}“ ist wieder da.`
            : `„${item.name}“ ist wieder da — als „${path.split("/").pop()}“, weil der Name inzwischen vergeben war.`,
        href: folder ? `/dashboard?path=${encodeURIComponent(folder)}` : "/dashboard",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Wiederherstellen ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: TrashItem) {
    if (!window.confirm(`„${item.name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return;
    setBusyId(item.id);
    try {
      await deleteTrashItem(item.id);
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Löschen ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleEmpty() {
    if (!window.confirm("Den ganzen Papierkorb endgültig leeren? Das lässt sich nicht rückgängig machen.")) return;
    setBusyId("all");
    try {
      await emptyTrash();
      setItems([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Leeren ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.toolbar} style={{ alignItems: "flex-start" }}>
        <div>
          <div className={styles.eyebrow}>Einstellungen</div>
          <h1 className={styles.title}>Papierkorb</h1>
        </div>
        {items && items.length > 0 && (
          <button className={styles.smallButton} onClick={handleEmpty} disabled={busyId !== null}>
            Papierkorb leeren
          </button>
        )}
      </div>
      <p className={styles.subtitle}>
        Gelöschte Notizen und Ordner bleiben hier {retentionDays} Tage, bevor sie
        endgültig verschwinden — auch das, was du direkt in GoodNotes löschst.
      </p>

      {message && (
        <div className={styles.connectionBoxSuccess} style={{ marginBottom: 16 }}>
          <span className={styles.connectionIcon}>✓</span>
          <span style={{ flex: 1 }}>{message.text}</span>
          {message.href && (
            <Link href={message.href} className={styles.smallButtonAccent}>
              Anzeigen
            </Link>
          )}
        </div>
      )}
      {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}

      {items === null ? (
        !error && <LoadingState />
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIllustration}>🗑</div>
          Der Papierkorb ist leer.
        </div>
      ) : (
        <div className={styles.fileList}>
          {items.map((item) => {
            const left = daysLeft(item.expiresAt);
            return (
              <div key={item.id} className={styles.fileRow}>
                <div className={item.isDirectory ? styles.fileIconFolder : styles.fileIcon}>
                  {item.isDirectory ? "📁" : "📄"}
                </div>
                <div className={styles.fileMain}>
                  <span className={styles.fileNameText}>{item.name}</span>
                  <span className={styles.fileMeta}>
                    {item.originalPath.includes("/") ? `aus ${item.originalPath.slice(0, item.originalPath.lastIndexOf("/"))} · ` : ""}
                    {item.deletedBy === "goodnotes" ? "in GoodNotes gelöscht" : "hier gelöscht"} am{" "}
                    {formatDateTime(item.deletedAt)} · {formatFileSize(item.size)} ·{" "}
                    <span style={left <= 3 ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                      {left === 0 ? "wird heute gelöscht" : `noch ${left} ${left === 1 ? "Tag" : "Tage"}`}
                    </span>
                  </span>
                </div>
                <div className={styles.fileActions}>
                  <button
                    className={styles.smallButtonAccent}
                    onClick={() => handleRestore(item)}
                    disabled={busyId !== null}
                  >
                    Wiederherstellen
                  </button>
                  <button
                    className={styles.iconButton}
                    onClick={() => handleDelete(item)}
                    disabled={busyId !== null}
                    title="Endgültig löschen"
                    aria-label="Endgültig löschen"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PapierkorbPage() {
  return <AuthedPage>{() => <TrashList />}</AuthedPage>;
}
