"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addFavorite,
  ApiError,
  downloadFileUrl,
  downloadPdfUrl,
  downloadZipUrl,
  fetchFavorites,
  fetchTree,
  removeFavorite,
  searchFiles,
  type SearchResult,
  type TreeNode,
} from "../lib/api";
import { formatDate, formatFileSize } from "../lib/format";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { ShareForm } from "./ShareControl";
import styles from "../app/ui.module.css";

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

  const [mode, setMode] = useState<"browse" | "favorites" | "search">("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchTree()
      .then((res) => setTree(res.tree))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Notizen konnten nicht geladen werden.")
      );
    fetchFavorites()
      .then((res) => setFavorites(new Set(res.paths)))
      .catch(() => {});
  }, []);

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

  function renderFileRow(
    node: { name: string; path: string; size?: number; modifiedAt?: string },
    options: { snippet?: string } = {}
  ) {
    const isFav = favorites.has(node.path);
    return (
      <Fragment key={node.path}>
        <div className={styles.fileRow}>
          <div className={styles.fileIcon}>📄</div>
          <div className={styles.fileMain}>
            <span className={styles.fileNameText}>{node.name}</span>
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

  if (error) {
    return <div className={styles.errorBox}>{error}</div>;
  }

  if (!tree) {
    return <p className={styles.hint}>Notizen werden geladen …</p>;
  }

  const searchBar = (
    <form
      onSubmit={handleSearchSubmit}
      style={{ display: "flex", gap: 8, marginBottom: 20 }}
    >
      <input
        className={styles.input}
        placeholder="Suchen (Dateiname oder Inhalt) …"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ flex: 1 }}
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
    </form>
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

  const children = findChildrenAtPath(tree, segments);

  if (children === null) {
    return (
      <div className={styles.errorBox}>
        Dieser Ordner wurde nicht gefunden.{" "}
        <a onClick={() => navigateTo([])} style={{ cursor: "pointer", fontWeight: 600 }}>
          Zurück zur Übersicht
        </a>
      </div>
    );
  }

  return (
    <div>
      {searchBar}
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

      {activeSharePath === (currentPath || ".") && (
        <div style={{ marginBottom: 20 }}>
          <ShareForm path={currentPath || "."} onClose={() => setActiveSharePath(null)} />
        </div>
      )}

      {children.length === 0 ? (
        <div className={styles.emptyState}>Dieser Ordner ist leer.</div>
      ) : (
        <div className={styles.fileList}>
          {children.map((node) => {
            if (node.type === "file") return renderFileRow(node);

            const isFav = favorites.has(node.path);
            return (
              <Fragment key={node.path}>
                <div className={styles.fileRow}>
                  <div className={styles.fileIcon}>📁</div>
                  <div
                    className={styles.fileMainClickable}
                    onClick={() => navigateTo([...segments, node.name])}
                  >
                    <span className={styles.fileNameText}>{node.name}</span>
                    <span className={styles.fileMeta}>
                      {node.children?.length ?? 0} Einträge
                    </span>
                  </div>
                  <div className={styles.fileActions}>
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
    </div>
  );
}
