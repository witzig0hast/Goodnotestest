"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  addStudySheetPages,
  createStudySheet,
  fetchStudySheets,
  type StudySheet,
} from "../lib/api";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";
import { Icon } from "./Icon";

/**
 * Viewer toolbar button: puts the page currently shown onto a Lernzettel
 * (an existing one, or a new one created on the spot).
 */
export function AddToSheetButton({ path, page }: { path: string; page: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sheets, setSheets] = useState<StudySheet[] | null>(null);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle() {
    if (!open) {
      setStatus(null);
      fetchStudySheets()
        .then((r) => setSheets(r.sheets))
        .catch(() => setSheets([]));
    }
    setOpen(!open);
  }

  async function addTo(sheet: StudySheet) {
    setBusy(true);
    try {
      await addStudySheetPages(sheet.id, [{ path, page }]);
      setStatus(t("Seite {page} liegt jetzt auf „{name}“.", { page, name: sheet.name }));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t("Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const sheet = await createStudySheet(name, [{ path, page }]);
      setSheets((s) => (s ? [sheet, ...s] : [sheet]));
      setNewName("");
      setStatus(t("Seite {page} liegt jetzt auf „{name}“.", { page, name: sheet.name }));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t("Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className={open ? styles.iconButtonActive : styles.iconButton}
        onClick={toggle}
        title={t("Seite zum Lernzettel hinzufügen")}
        aria-label={t("Seite zum Lernzettel hinzufügen")}
        aria-expanded={open}
      >
        <Icon name="layers" />
      </button>
      {open && (
        <div className={`${styles.menuPanel} ${styles.sheetMenu}`}>
          <div className={styles.menuHeading}>{t("Seite {page} hinzufügen zu …", { page })}</div>
          {sheets === null ? (
            <div className={styles.sheetMenuNote}>{t("Lädt …")}</div>
          ) : (
            sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                className={styles.menuItem}
                onClick={() => addTo(sheet)}
                disabled={busy}
              >
                <span className={styles.menuIcon}><Icon name="layers" size={16} /></span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{sheet.name}</span>
                <span className={styles.sheetMenuCount}>{sheet.pages.length}</span>
              </button>
            ))
          )}
          <form onSubmit={createAndAdd} className={styles.sheetMenuForm}>
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("Neuer Lernzettel, z. B. „Klausur Analysis“")}
              maxLength={80}
              aria-label={t("Name für neuen Lernzettel")}
            />
            <button type="submit" className={styles.smallButtonAccent} disabled={busy || !newName.trim()}>
              {t("Anlegen")}
            </button>
          </form>
          {status && <div className={styles.sheetMenuNote} role="status">{status}</div>}
          <Link href="/dashboard/lernzettel" className={styles.menuItem}>
            <span className={styles.menuIcon}><Icon name="list" size={16} /></span>
            {t("Alle Lernzettel ansehen")}
          </Link>
        </div>
      )}
    </span>
  );
}
