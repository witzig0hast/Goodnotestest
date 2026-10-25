"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthedPage } from "../../../components/AuthedPage";
import { LoadingState } from "../../../components/LoadingState";
import { PdfPreviewModal } from "../../../components/PdfPreviewModal";
import { PdfViewer } from "../../../components/PdfViewer";
import {
  ApiError,
  createStudySheet,
  deleteStudySheet,
  fetchStudySheets,
  removeStudySheetPage,
  saveStudySheet,
  studySheetPdfUrl,
  updateStudySheet,
  type StudySheet,
} from "../../../lib/api";
import { translate, useT } from "../../../lib/i18n";
import styles from "../../ui.module.css";
import { Icon } from "../../../components/Icon";

function fileName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.pdf$/i, "");
}

function SheetEditor() {
  const t = useT();
  const [sheets, setSheets] = useState<StudySheet[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ path: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [source, setSource] = useState<{ path: string; page: number } | null>(null);

  useEffect(() => {
    fetchStudySheets()
      .then((r) => {
        setSheets(r.sheets);
        setActiveId(r.sheets[0]?.id ?? null);
      })
      .catch(() => setError(translate("Die Lernzettel konnten nicht geladen werden.")));
  }, []);

  const active = sheets?.find((s) => s.id === activeId) ?? null;

  function replace(sheet: StudySheet) {
    setSheets((list) => list?.map((s) => (s.id === sheet.id ? sheet : s)) ?? null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Das hat nicht geklappt."));
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      const sheet = await createStudySheet(name);
      setSheets((list) => [sheet, ...(list ?? [])]);
      setActiveId(sheet.id);
      setNewName("");
      setSaved(null);
    });
  }

  function move(index: number, delta: number) {
    if (!active) return;
    const ids = active.pages.map((p) => p.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // optimistic: reorder locally first so the list doesn't jump
    const byId = new Map(active.pages.map((p) => [p.id, p]));
    replace({ ...active, pages: ids.map((id) => byId.get(id)!) });
    run(async () => replace(await updateStudySheet(active.id, { order: ids })));
  }

  function rename() {
    if (!active) return;
    const name = window.prompt(t("Neuer Name für den Lernzettel:"), active.name)?.trim();
    if (!name || name === active.name) return;
    run(async () => replace(await updateStudySheet(active.id, { name })));
  }

  function remove() {
    if (!active) return;
    if (!window.confirm(t("Lernzettel „{name}“ löschen? Deine Notizen bleiben unverändert.", { name: active.name }))) return;
    run(async () => {
      await deleteStudySheet(active.id);
      const rest = sheets?.filter((s) => s.id !== active.id) ?? [];
      setSheets(rest);
      setActiveId(rest[0]?.id ?? null);
    });
  }

  function save() {
    if (!active) return;
    run(async () => {
      const result = await saveStudySheet(active.id);
      setSaved(result);
    });
  }

  if (sheets === null) {
    return <section className={styles.card}>{error ? <div className={styles.errorBox}>{error}</div> : <LoadingState />}</section>;
  }

  const savedFolder = saved ? saved.path.slice(0, saved.path.lastIndexOf("/")) : "";

  return (
    <section className={styles.card}>
      <div className={styles.eyebrow}>{t("Lernen")}</div>
      <h1 className={styles.title}>{t("Lernzettel")}</h1>
      <p className={styles.subtitle}>
        {t(
          "Stell einzelne Seiten aus verschiedenen Notizen zu einem PDF zusammen — etwa alle Formeln für die Klausur. Öffne dazu eine Notiz und tippe oben auf das Stapel-Symbol."
        )}
      </p>

      {error && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{error}</div>}

      <div className={styles.sheetLayout}>
        <div>
          <div className={styles.sheetList}>
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                className={sheet.id === activeId ? styles.sheetListItemActive : styles.sheetListItem}
                onClick={() => {
                  setActiveId(sheet.id);
                  setSaved(null);
                }}
              >
                <Icon name="layers" size={16} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sheet.name}
                </span>
                <span className={styles.sheetMenuCount}>{sheet.pages.length}</span>
              </button>
            ))}
          </div>
          <form onSubmit={handleCreate} className={styles.sheetNewForm}>
            <input
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("Neuer Lernzettel")}
              maxLength={80}
              aria-label={t("Name für neuen Lernzettel")}
            />
            <button type="submit" className={styles.smallButtonAccent} disabled={busy || !newName.trim()}>
              {t("Anlegen")}
            </button>
          </form>
        </div>

        <div>
          {!active ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIllustration}><Icon name="layers" size={40} strokeWidth={1.4} /></div>
              {t("Noch kein Lernzettel. Leg links einen an oder öffne eine Notiz und füge eine Seite hinzu.")}
            </div>
          ) : (
            <>
              <div className={styles.toolbar} style={{ marginBottom: 12, flexWrap: "wrap" }}>
                <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{active.name}</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className={styles.smallButton} onClick={rename} disabled={busy}>
                    <Icon name="pencil" size={14} /> {t("Umbenennen")}
                  </button>
                  <button type="button" className={styles.smallButton} onClick={remove} disabled={busy}>
                    <Icon name="trash" size={14} /> {t("Löschen")}
                  </button>
                </div>
              </div>

              {active.pages.length === 0 ? (
                <div className={styles.emptyState}>
                  {t("Dieser Lernzettel ist noch leer. Öffne eine Notiz, blättere zur gewünschten Seite und tippe oben auf das Stapel-Symbol.")}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {active.pages.map((entry, i) => (
                      <div key={entry.id} className={styles.sheetPageRow}>
                        <span className={styles.sheetPageNumber}>{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setSource({ path: entry.path, page: entry.page })}
                          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
                          title={t("Originalseite öffnen")}
                        >
                          <span className={styles.fileNameText} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {fileName(entry.path)}
                          </span>
                          <span className={styles.fileMeta} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t("Seite {page}", { page: entry.page })}
                            {entry.path.includes("/") ? ` · ${entry.path.slice(0, entry.path.lastIndexOf("/"))}` : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => move(i, -1)}
                          disabled={busy || i === 0}
                          aria-label={t("Nach oben")}
                          title={t("Nach oben")}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => move(i, 1)}
                          disabled={busy || i === active.pages.length - 1}
                          aria-label={t("Nach unten")}
                          title={t("Nach unten")}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => run(async () => replace(await removeStudySheetPage(active.id, entry.id)))}
                          disabled={busy}
                          aria-label={t("Seite entfernen")}
                          title={t("Seite entfernen")}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className={styles.sheetActions}>
                    <button type="button" className={styles.button} onClick={() => setViewing(true)}>
                      <Icon name="eye" size={16} /> {t("Ansehen")}
                    </button>
                    <a className={styles.buttonSecondary} href={studySheetPdfUrl(active, true)}>
                      <Icon name="download" size={16} /> {t("Als PDF herunterladen")}
                    </a>
                    <button type="button" className={styles.buttonSecondary} onClick={save} disabled={busy}>
                      <Icon name="archive" size={16} /> {t("In meinen Notizen speichern")}
                    </button>
                  </div>
                </>
              )}

              {saved && (
                <div className={styles.connectionBoxSuccess} style={{ marginTop: 16 }}>
                  <span className={styles.connectionIcon}><Icon name="check" size={16} /></span>
                  <span style={{ flex: 1 }}>
                    {t("Gespeichert als „{name}“ im Ordner „{folder}“ — von dort kannst du ihn wie jede Notiz teilen.", {
                      name: saved.name,
                      folder: savedFolder,
                    })}
                  </span>
                  <Link href={`/dashboard?path=${encodeURIComponent(savedFolder)}`} className={styles.smallButtonAccent}>
                    {t("Anzeigen")}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewing && active && (
        <PdfViewer
          url={studySheetPdfUrl(active)}
          title={active.name}
          downloadUrl={studySheetPdfUrl(active, true)}
          onClose={() => setViewing(false)}
        />
      )}
      {source && <PdfPreviewModal path={source.path} initialPage={source.page} onClose={() => setSource(null)} />}
    </section>
  );
}

export default function LernzettelPage() {
  return <AuthedPage>{() => <SheetEditor />}</AuthedPage>;
}
