"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addFavorite,
  ApiError,
  deleteEntry,
  downloadFileUrl,
  downloadPdfUrl,
  downloadZipMultiUrl,
  downloadZipUrl,
  fetchFavorites,
  fetchStats,
  fetchTree,
  fetchVersions,
  removeFavorite,
  renameEntry,
  restoreVersion,
  searchFiles,
  thumbnailUrl,
  versionDownloadUrl,
  type FileVersion,
  type RepositoryStats,
  type SearchResult,
  type TreeNode,
} from "../lib/api";
import { formatDate, formatFileSize } from "../lib/format";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { ShareForm } from "./ShareControl";
import styles from "../app/ui.module.css";

type SortBy = "name" | "date";
type ViewMode = "list" | "grid";
type Mode = "browse" | "favorites" | "search" | "recent";

function findChildrenAtPath(tree: TreeNode[], segments: string[]): TreeNode[] | null {
  if (segments.length === 0) return tree;
  const [head, ...rest] = segments;
  const match = tree.find((node) => node.type === "folder" && node.name === head);
  if (!match || !match.children) return null;
  return findChildrenAtPath(match.children, rest);
}

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  const files: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") files.push(node);
    else if (node.children) files.push(...flattenFiles(node.children));
  }
  return files;
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function sortNodes(nodes: TreeNode[], sortBy: SortBy, sortDir: "asc" | "desc"): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    // folders always first, regardless of sort field
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    if (sortBy === "date") {
      const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
      const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
      return aTime - bTime;
    }
    return a.name.localeCompare(b.name, "de");
  });
  return sortDir === "desc" ? sorted.reverse() : sorted;
}

export function FileBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get("path") ?? "";
  const segments = useMemo(
    () => (currentPath ? currentPath.split("/") : []),
    [currentPath]
  );

  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSharePath, setActiveSharePath] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [stats, setStats] = useState<RepositoryStats | null>(null);

  const [mode, setMode] = useState<Mode>("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSharing, setBulkSharing] = useState(false);

  const [versionsPath, setVersionsPath] = useState<string | null>(null);
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [versionsBusy, setVersionsBusy] = useState(false);

  function reloadTree() {
    fetchTree()
      .then((res) => setTree(res.tree))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Notizen konnten nicht geladen werden.")
      );
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }

  useEffect(() => {
    reloadTree();
    fetchFavorites()
      .then((res) => setFavorites(new Set(res.paths)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [currentPath, mode]);

  function navigateTo(pathSegments: string[]) {
    const path = pathSegments.join("/");
    setActiveSharePath(null);
    setMode("browse");
    router.push(path ? `/dashboard?path=${encodeURIComponent(path)}` : "/dashboard");
  }

  function toggleShare(path: string) {
    setActiveSharePath((current) => (current === path ? null : path));
  }

  async function toggleFavorite(path: string) {
    const isFav = favorites.has(path);
    setFavorites((current) => {
      const next = new Set(current);
      if (isFav) next.delete(path);
      else next.add(path);
      return next;
    });
    try {
      if (isFav) await removeFavorite(path);
      else await addFavorite(path);
    } catch {
      // revert on failure
      setFavorites((current) => {
        const next = new Set(current);
        if (isFav) next.add(path);
        else next.delete(path);
        return next;
      });
    }
  }

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setMode("search");
    try {
      const res = await searchFiles(searchQuery.trim());
      setSearchResults(res.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(path: string, isFolder: boolean) {
    const label = isFolder ? "diesen Ordner samt Inhalt" : "diese Datei";
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} wirklich löschen?`)) {
      return;
    }
    setBusyPath(path);
    try {
      await deleteEntry(path);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
      reloadTree();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Löschen ist fehlgeschlagen.");
    } finally {
      setBusyPath(null);
    }
  }

  function startRename(path: string, currentName: string) {
    setRenamingPath(path);
    setRenameValue(currentName);
  }

  async function submitRename(path: string) {
    const newName = renameValue.trim();
    if (!newName) {
      setRenamingPath(null);
      return;
    }
    setBusyPath(path);
    try {
      await renameEntry(path, newName);
      setRenamingPath(null);
      reloadTree();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Umbenennen ist fehlgeschlagen.");
    } finally {
      setBusyPath(null);
    }
  }

  function toggleSelect(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function openVersions(path: string) {
    setVersionsPath(path);
    setVersions(null);
    fetchVersions(path)
      .then((res) => setVersions(res.versions))
      .catch(() => setVersions([]));
  }

  async function handleRestoreVersion(timestamp: string) {
    if (!versionsPath) return;
    if (!window.confirm("Diese Version wiederherstellen? Die aktuelle Version wird dabei ebenfalls gesichert.")) {
      return;
    }
    setVersionsBusy(true);
    try {
      await restoreVersion(versionsPath, timestamp);
      setVersionsPath(null);
      reloadTree();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Wiederherstellen ist fehlgeschlagen.");
    } finally {
      setVersionsBusy(false);
    }
  }

  function renderFileRow(
    node: { name: string; path: string; size?: number; modifiedAt?: string },
    options: { snippet?: string; selectable?: boolean } = {}
  ) {
    const isFav = favorites.has(node.path);
    const isRenaming = renamingPath === node.path;
    const isBusy = busyPath === node.path;
    return (
      <Fragment key={node.path}>
        <div className={styles.fileRow}>
          {options.selectable && (
            <input
              type="checkbox"
              checked={selected.has(node.path)}
              onChange={() => toggleSelect(node.path)}
            />
          )}
          <div className={styles.fileIcon}>📄</div>
          <div className={styles.fileMain}>
            {isRenaming ? (
              <input
                className={styles.input}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(node.path);
                  if (e.key === "Escape") setRenamingPath(null);
                }}
                autoFocus
                style={{ maxWidth: 260 }}
              />
            ) : (
              <span className={styles.fileNameText}>{node.name}</span>
            )}
            <span className={styles.fileMeta}>
              {mode !== "browse" ? `${node.path} · ` : ""}
              {node.size !== undefined ? `${formatFileSize(node.size)} · ` : ""}
              {node.modifiedAt ? formatDate(node.modifiedAt) : ""}
            </span>
            {options.snippet && (
              <span className={styles.fileMeta} style={{ fontStyle: "italic" }}>
                „…{options.snippet}…“
              </span>
            )}
          </div>
          <div className={styles.fileActions}>
            {isRenaming ? (
              <>
                <button
                  className={styles.smallButton}
                  onClick={() => submitRename(node.path)}
                  disabled={isBusy}
                >
                  Speichern
                </button>
                <button className={styles.smallButton} onClick={() => setRenamingPath(null)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <>
                <button
                  className={styles.smallButton}
                  onClick={() => toggleFavorite(node.path)}
                  title={isFav ? "Favorit entfernen" : "Als Favorit markieren"}
                >
                  {isFav ? "★" : "☆"}
                </button>
                {isPdf(node.name) && (
                  <button className={styles.smallButton} onClick={() => setPreviewPath(node.path)}>
                    Vorschau
                  </button>
                )}
                <a className={styles.smallButton} href={downloadFileUrl(node.path)}>
                  Herunterladen
                </a>
                <button className={styles.smallButton} onClick={() => toggleShare(node.path)}>
                  Teilen
                </button>
                <button className={styles.smallButton} onClick={() => openVersions(node.path)}>
                  Verlauf
                </button>
                <button
                  className={styles.smallButton}
                  onClick={() => startRename(node.path, node.name)}
                >
                  Umbenennen
                </button>
                <button
                  className={styles.smallButton}
                  onClick={() => handleDelete(node.path, false)}
                  disabled={isBusy}
                >
                  Löschen
                </button>
              </>
            )}
          </div>
        </div>
        {activeSharePath === node.path && (
          <div style={{ padding: "0 16px 16px" }}>
            <ShareForm path={node.path} onClose={() => setActiveSharePath(null)} />
          </div>
        )}
      </Fragment>
    );
  }

  function renderGridItem(node: TreeNode, selectable: boolean) {
    return (
      <div
        key={node.path}
        className={styles.gridItem}
        onClick={() => {
          if (node.type === "folder") navigateTo([...segments, node.name]);
          else if (isPdf(node.name)) setPreviewPath(node.path);
        }}
      >
        {selectable && (
          <input
            type="checkbox"
            className={styles.gridCheckbox}
            checked={selected.has(node.path)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelect(node.path)}
          />
        )}
        <div className={styles.gridThumb}>
          {node.type === "folder" ? (
            "📁"
          ) : isPdf(node.name) ? (
            // eslint-disable-next-line @next/next/no-img-element -- backend-generated thumbnail, not a static asset
            <img
              src={thumbnailUrl(node.path)}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            "📄"
          )}
        </div>
        <span className={styles.gridName} title={node.name}>
          {node.name}
        </span>
      </div>
    );
  }

  if (error) {
    return <div className={styles.errorBox}>{error}</div>;
  }

  if (!tree) {
    return <p className={styles.hint}>Notizen werden geladen …</p>;
  }

  const searchBar = (
    <form
      onSubmit={handleSearchSubmit}
      style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
    >
      <input
        className={styles.input}
        placeholder="Suchen (Dateiname oder Inhalt) …"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ flex: 1, minWidth: 180 }}
      />
      <button className={styles.smallButton} type="submit" disabled={searching}>
        {searching ? "Sucht …" : "Suchen"}
      </button>
      <button
        type="button"
        className={mode === "favorites" ? styles.smallButtonAccent : styles.smallButton}
        onClick={() => setMode(mode === "favorites" ? "browse" : "favorites")}
      >
        ★ Favoriten
      </button>
      <button
        type="button"
        className={mode === "recent" ? styles.smallButtonAccent : styles.smallButton}
        onClick={() => setMode(mode === "recent" ? "browse" : "recent")}
      >
        🕓 Neu (7 Tage)
      </button>
    </form>
  );

  const statsBar = stats && mode === "browse" && segments.length === 0 && (
    <div className={styles.statsTiles}>
      <div className={styles.statTile}>
        <div className={styles.statTileValue}>{stats.totalFiles}</div>
        <div className={styles.statTileLabel}>Dateien</div>
      </div>
      <div className={styles.statTile}>
        <div className={styles.statTileValue}>{formatFileSize(stats.totalSize)}</div>
        <div className={styles.statTileLabel}>Gesamtgröße</div>
      </div>
      <div className={styles.statTile}>
        <div className={styles.statTileValue}>
          {stats.lastBackupAt ? formatDate(stats.lastBackupAt) : "—"}
        </div>
        <div className={styles.statTileLabel}>Letztes Backup</div>
      </div>
    </div>
  );

  const versionsModal = versionsPath && (
    <div className={styles.modalOverlay} onClick={() => setVersionsPath(null)}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Versionsverlauf</h2>
        <p className={styles.hint} style={{ marginBottom: 16 }}>
          {versionsPath} — die letzten Versionen vor einem Überschreiben werden
          automatisch aufbewahrt.
        </p>
        {versions === null ? (
          <p className={styles.hint}>Wird geladen …</p>
        ) : versions.length === 0 ? (
          <p className={styles.hint}>Für diese Datei gibt es noch keine älteren Versionen.</p>
        ) : (
          <div className={styles.fileList}>
            {versions.map((v) => (
              <div className={styles.fileRow} key={v.timestamp}>
                <div className={styles.fileIcon}>🕓</div>
                <div className={styles.fileMain}>
                  <span className={styles.fileNameText}>{formatDate(v.timestamp)}</span>
                  <span className={styles.fileMeta}>{formatFileSize(v.size)}</span>
                </div>
                <div className={styles.fileActions}>
                  <a
                    className={styles.smallButton}
                    href={versionDownloadUrl(versionsPath, v.timestamp)}
                  >
                    Herunterladen
                  </a>
                  <button
                    className={styles.smallButton}
                    onClick={() => handleRestoreVersion(v.timestamp)}
                    disabled={versionsBusy}
                  >
                    Wiederherstellen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          className={styles.smallButton}
          onClick={() => setVersionsPath(null)}
          style={{ marginTop: 16 }}
        >
          Schließen
        </button>
      </div>
    </div>
  );

  if (mode === "search") {
    return (
      <div>
        {searchBar}
        <div className={styles.toolbar}>
          <div className={styles.hint}>
            {searchResults?.length ?? 0} Treffer für „{searchQuery}“
          </div>
          <button className={styles.smallButton} onClick={() => navigateTo(segments)}>
            Zurück zum Ordner
          </button>
        </div>
        {searchResults && searchResults.length > 0 ? (
          <div className={styles.fileList}>
            {searchResults.map((r) => renderFileRow(r, { snippet: r.snippet }))}
          </div>
        ) : (
          <div className={styles.emptyState}>Keine Treffer.</div>
        )}
        {previewPath && (
          <PdfPreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
        )}
        {versionsModal}
      </div>
    );
  }

  if (mode === "favorites") {
    const favoriteFiles = flattenFiles(tree).filter((f) => favorites.has(f.path));
    return (
      <div>
        {searchBar}
        <div className={styles.toolbar}>
          <div className={styles.hint}>{favoriteFiles.length} Favoriten</div>
          <button className={styles.smallButton} onClick={() => navigateTo(segments)}>
            Zurück zum Ordner
          </button>
        </div>
        {favoriteFiles.length > 0 ? (
          <div className={styles.fileList}>{favoriteFiles.map((f) => renderFileRow(f))}</div>
        ) : (
          <div className={styles.emptyState}>
            Noch keine Favoriten — markiere Dateien mit dem Stern.
          </div>
        )}
        {previewPath && (
          <PdfPreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
        )}
        {versionsModal}
      </div>
    );
  }

  if (mode === "recent") {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentFiles = flattenFiles(tree)
      .filter((f) => f.modifiedAt && new Date(f.modifiedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.modifiedAt!).getTime() - new Date(a.modifiedAt!).getTime());
    return (
      <div>
        {searchBar}
        <div className={styles.toolbar}>
          <div className={styles.hint}>
            {recentFiles.length} {recentFiles.length === 1 ? "Datei" : "Dateien"} der letzten 7 Tage
          </div>
          <button className={styles.smallButton} onClick={() => navigateTo(segments)}>
            Zurück zum Ordner
          </button>
        </div>
        {recentFiles.length > 0 ? (
          <div className={styles.fileList}>{recentFiles.map((f) => renderFileRow(f))}</div>
        ) : (
          <div className={styles.emptyState}>
            In den letzten 7 Tagen ist nichts Neues dazugekommen.
          </div>
        )}
        {previewPath && (
          <PdfPreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
        )}
        {versionsModal}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p style={{ marginBottom: 8, fontWeight: 600, color: "var(--foreground)" }}>
          Hier ist noch nichts angekommen.
        </p>
        <p className={styles.hint}>
          Richte in GoodNotes unter Einstellungen → Backup → WebDAV die Zugangsdaten
          von der Erstellungs-Seite ein und tippe auf „Jetzt sichern“ — deine Notizen
          erscheinen hier automatisch.
        </p>
      </div>
    );
  }

  const rawChildren = findChildrenAtPath(tree, segments);

  if (rawChildren === null) {
    return (
      <div className={styles.errorBox}>
        Dieser Ordner wurde nicht gefunden.{" "}
        <a onClick={() => navigateTo([])} style={{ cursor: "pointer", fontWeight: 600 }}>
          Zurück zur Übersicht
        </a>
      </div>
    );
  }

  const children = sortNodes(rawChildren, sortBy, sortDir);

  return (
    <div>
      {searchBar}
      {statsBar}
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbLink} onClick={() => navigateTo([])}>
          Meine Notizen
        </span>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <span key={index} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>/</span>
              {isLast ? (
                <span className={styles.breadcrumbCurrent}>{segment}</span>
              ) : (
                <span
                  className={styles.breadcrumbLink}
                  onClick={() => navigateTo(segments.slice(0, index + 1))}
                >
                  {segment}
                </span>
              )}
            </span>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.hint}>
          {children.length} {children.length === 1 ? "Eintrag" : "Einträge"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={styles.smallButton}
            onClick={() => {
              if (sortBy === "name") setSortDir(sortDir === "asc" ? "desc" : "asc");
              else {
                setSortBy("name");
                setSortDir("asc");
              }
            }}
          >
            Name {sortBy === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            className={styles.smallButton}
            onClick={() => {
              if (sortBy === "date") setSortDir(sortDir === "asc" ? "desc" : "asc");
              else {
                setSortBy("date");
                setSortDir("desc");
              }
            }}
          >
            Datum {sortBy === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
          <button
            className={styles.smallButton}
            onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
          >
            {viewMode === "list" ? "Rasteransicht" : "Listenansicht"}
          </button>
          <a className={styles.smallButtonAccent} href={downloadZipUrl(currentPath)}>
            Als ZIP herunterladen
          </a>
          <a className={styles.smallButton} href={downloadPdfUrl(currentPath)}>
            Als eine PDF
          </a>
          <button className={styles.smallButton} onClick={() => toggleShare(currentPath || ".")}>
            Diesen Ordner teilen
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className={styles.toolbar} style={{ background: "var(--accent-soft)", borderRadius: 8, padding: 10 }}>
          <div className={styles.hint}>{selected.size} ausgewählt</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              className={styles.smallButtonAccent}
              href={downloadZipMultiUrl(Array.from(selected))}
            >
              Auswahl als ZIP
            </a>
            <button className={styles.smallButton} onClick={() => setBulkSharing(true)}>
              Auswahl teilen
            </button>
            <button className={styles.smallButton} onClick={() => setSelected(new Set())}>
              Auswahl aufheben
            </button>
          </div>
        </div>
      )}

      {bulkSharing && selected.size > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ShareForm paths={Array.from(selected)} onClose={() => setBulkSharing(false)} />
        </div>
      )}

      {activeSharePath === (currentPath || ".") && (
        <div style={{ marginBottom: 20 }}>
          <ShareForm path={currentPath || "."} onClose={() => setActiveSharePath(null)} />
        </div>
      )}

      {children.length === 0 ? (
        <div className={styles.emptyState}>Dieser Ordner ist leer.</div>
      ) : viewMode === "grid" ? (
        <div className={styles.gridList}>
          {children.map((node) => renderGridItem(node, true))}
        </div>
      ) : (
        <div className={styles.fileList}>
          {children.map((node) => {
            if (node.type === "file") return renderFileRow(node, { selectable: true });

            const isFav = favorites.has(node.path);
            const isRenaming = renamingPath === node.path;
            const isBusy = busyPath === node.path;
            return (
              <Fragment key={node.path}>
                <div className={styles.fileRow}>
                  <input
                    type="checkbox"
                    checked={selected.has(node.path)}
                    onChange={() => toggleSelect(node.path)}
                  />
                  <div className={styles.fileIcon}>📁</div>
                  {isRenaming ? (
                    <div className={styles.fileMain}>
                      <input
                        className={styles.input}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(node.path);
                          if (e.key === "Escape") setRenamingPath(null);
                        }}
                        autoFocus
                        style={{ maxWidth: 260 }}
                      />
                    </div>
                  ) : (
                    <div
                      className={styles.fileMainClickable}
                      onClick={() => navigateTo([...segments, node.name])}
                    >
                      <span className={styles.fileNameText}>{node.name}</span>
                      <span className={styles.fileMeta}>
                        {node.children?.length ?? 0} Einträge
                      </span>
                    </div>
                  )}
                  <div className={styles.fileActions}>
                    {isRenaming ? (
                      <>
                        <button
                          className={styles.smallButton}
                          onClick={() => submitRename(node.path)}
                          disabled={isBusy}
                        >
                          Speichern
                        </button>
                        <button className={styles.smallButton} onClick={() => setRenamingPath(null)}>
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={styles.smallButton}
                          onClick={() => toggleFavorite(node.path)}
                          title={isFav ? "Favorit entfernen" : "Als Favorit markieren"}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                        <a className={styles.smallButton} href={downloadZipUrl(node.path)}>
                          Als ZIP
                        </a>
                        <a className={styles.smallButton} href={downloadPdfUrl(node.path)}>
                          Als PDF
                        </a>
                        <button className={styles.smallButton} onClick={() => toggleShare(node.path)}>
                          Teilen
                        </button>
                        <button
                          className={styles.smallButton}
                          onClick={() => startRename(node.path, node.name)}
                        >
                          Umbenennen
                        </button>
                        <button
                          className={styles.smallButton}
                          onClick={() => handleDelete(node.path, true)}
                          disabled={isBusy}
                        >
                          Löschen
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {activeSharePath === node.path && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <ShareForm path={node.path} onClose={() => setActiveSharePath(null)} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {previewPath && (
        <PdfPreviewModal path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
      {versionsModal}
    </div>
  );
}
