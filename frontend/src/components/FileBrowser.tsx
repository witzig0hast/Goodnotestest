"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  fetchTrash,
  fetchTags,
  fetchIndexStatus,
  type IndexStatus,
  assignTag,
  unassignTag,
  type Tag,
  restoreTrashItem,
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
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { openTour } from "./WelcomeTour";
import { LoadingState } from "./LoadingState";
import { ShareForm } from "./ShareControl";
import { UploadLinkForm } from "./UploadLinkForm";
import { TagChip, TagPicker } from "./TagPicker";
import styles from "../app/ui.module.css";

type SortBy = "name" | "date";
type ViewMode = "list" | "grid";
type Mode = "browse" | "favorites" | "search" | "recent" | "tag";

interface Toast {
  text: string;
  actionLabel?: string;
  action?: () => void;
}

function findChildrenAtPath(tree: TreeNode[], segments: string[]): TreeNode[] | null {
  if (segments.length === 0) return tree;
  const [head, ...rest] = segments;
  const match = tree.find((node) => node.type === "folder" && node.name === head);
  if (!match || !match.children) return null;
  return findChildrenAtPath(match.children, rest);
}

function flattenAll(nodes: TreeNode[]): TreeNode[] {
  const all: TreeNode[] = [];
  for (const node of nodes) {
    all.push(node);
    if (node.children) all.push(...flattenAll(node.children));
  }
  return all;
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

// GoodNotes' own backup format: a proprietary archive no browser (and no
// PDF library) can display — only GoodNotes itself can open it.
function isGoodnotesFile(name: string): boolean {
  return name.toLowerCase().endsWith(".goodnotes");
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
  const [uploadLinkPath, setUploadLinkPath] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number | undefined>(undefined);
  const [formatHintPath, setFormatHintPath] = useState<string | null>(null);
  const [stats, setStats] = useState<RepositoryStats | null>(null);

  const [mode, setMode] = useState<Mode>("browse");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagAssignments, setTagAssignments] = useState<Record<string, string[]>>({});
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [tagPickerPath, setTagPickerPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    fetchTags()
      .then((res) => {
        setTags(res.tags);
        setTagAssignments(res.assignments);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tagsFor(path: string): Tag[] {
    const ids = tagAssignments[path] ?? [];
    return tags.filter((t) => ids.includes(t.id));
  }

  function renderTags(path: string) {
    const list = tagsFor(path);
    if (list.length === 0) return null;
    return (
      <span className={styles.tagRow}>
        {list.map((t) => (
          <TagChip key={t.id} tag={t} small />
        ))}
      </span>
    );
  }

  async function toggleTag(path: string, tagId: string, on: boolean) {
    const apply = (add: boolean) =>
      setTagAssignments((current) => {
        const ids = new Set(current[path] ?? []);
        if (add) ids.add(tagId);
        else ids.delete(tagId);
        return { ...current, [path]: Array.from(ids) };
      });
    apply(on);
    try {
      if (on) await assignTag(tagId, path);
      else await unassignTag(tagId, path);
    } catch {
      apply(!on);
    }
  }

  function handleTagsChanged(next: Tag[]) {
    setTags(next);
    const ids = new Set(next.map((t) => t.id));
    setTagAssignments((current) =>
      Object.fromEntries(Object.entries(current).map(([p, list]) => [p, list.filter((id) => ids.has(id))]))
    );
    if (activeTagId && !ids.has(activeTagId)) {
      setActiveTagId(null);
      setMode("browse");
    }
  }

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
      fetchIndexStatus().then(setIndexStatus).catch(() => {});
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function showToast(next: Toast) {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }

  async function undoDelete(path: string) {
    setToast(null);
    try {
      const { items } = await fetchTrash();
      const item = items.find((i) => i.originalPath === path);
      if (item) await restoreTrashItem(item.id);
      reloadTree();
    } catch {
      window.alert("Rückgängig machen hat nicht geklappt — schau im Papierkorb nach.");
    }
  }

  async function handleDelete(path: string, isFolder: boolean) {
    const label = isFolder ? "Diesen Ordner samt Inhalt" : "Diese Datei";
    if (!window.confirm(`${label} in den Papierkorb verschieben? Dort bleibt sie 30 Tage wiederherstellbar.`)) {
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
      showToast({
        text: `„${path.split("/").pop()}“ liegt jetzt im Papierkorb.`,
        actionLabel: "Rückgängig",
        action: () => undoDelete(path),
      });
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

  function openFile(node: { name: string; path: string }, page?: number) {
    if (isPdf(node.name)) {
      setPreviewPage(page);
      setPreviewPath(node.path);
    } else if (isGoodnotesFile(node.name)) {
      setFormatHintPath(node.path);
    } else {
      window.location.assign(downloadFileUrl(node.path));
    }
  }

  function renderRenameInput(path: string) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className={styles.input}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename(path);
            if (e.key === "Escape") setRenamingPath(null);
          }}
          autoFocus
          style={{ flex: 1, minWidth: 140, padding: "7px 10px", fontSize: 15 }}
        />
        <button
          className={styles.smallButtonAccent}
          onClick={() => submitRename(path)}
          disabled={busyPath === path}
        >
          Speichern
        </button>
        <button className={styles.smallButton} onClick={() => setRenamingPath(null)}>
          Abbrechen
        </button>
      </div>
    );
  }

  function favoriteButton(path: string) {
    const isFav = favorites.has(path);
    return (
      <button
        className={isFav ? styles.iconButtonActive : styles.iconButton}
        onClick={() => toggleFavorite(path)}
        title={isFav ? "Favorit entfernen" : "Als Favorit markieren"}
        aria-label={isFav ? "Favorit entfernen" : "Als Favorit markieren"}
      >
        {isFav ? "★" : "☆"}
      </button>
    );
  }

  function renderFileRow(
    node: { name: string; path: string; size?: number; modifiedAt?: string },
    options: {
      snippet?: string;
      selectable?: boolean;
      page?: number;
      matchedIn?: SearchResult["matchedIn"];
    } = {}
  ) {
    const isRenaming = renamingPath === node.path;
    const isBusy = busyPath === node.path;
    const menuItems: (ActionMenuItem | "divider")[] = [
      ...(isPdf(node.name)
        ? [{ label: "Ansehen", icon: "👁", onClick: () => setPreviewPath(node.path) }]
        : []),
      { label: "Herunterladen", icon: "⬇", href: downloadFileUrl(node.path) },
      { label: "Teilen", icon: "📤", onClick: () => toggleShare(node.path) },
      { label: "Ältere Versionen", icon: "🕓", onClick: () => openVersions(node.path) },
      { label: "Tags …", icon: "🏷", onClick: () => setTagPickerPath(node.path) },
      { label: "Umbenennen", icon: "✏️", onClick: () => startRename(node.path, node.name) },
      "divider",
      {
        label: "In den Papierkorb",
        icon: "🗑",
        danger: true,
        disabled: isBusy,
        onClick: () => handleDelete(node.path, false),
      },
    ];
    return (
      <Fragment key={node.path}>
        <div className={styles.fileRow}>
          {options.selectable && (
            <input
              type="checkbox"
              checked={selected.has(node.path)}
              onChange={() => toggleSelect(node.path)}
              aria-label={`${node.name} auswählen`}
            />
          )}
          <div className={styles.fileIcon}>
            {isPdf(node.name) ? "📄" : isGoodnotesFile(node.name) ? "📓" : "📎"}
          </div>
          {isRenaming ? (
            <div className={styles.fileMain}>{renderRenameInput(node.path)}</div>
          ) : (
            <div
              className={styles.fileMainClickable}
              onClick={() => openFile(node, options.page)}
              title={isPdf(node.name) ? "Ansehen" : "Herunterladen"}
            >
              <span className={styles.fileNameText}>
                {node.name.replace(/\.(pdf|goodnotes)$/i, "")}
              </span>
              <span className={styles.fileMeta}>
                {mode !== "browse" ? `${node.path} · ` : ""}
                {node.size !== undefined ? `${formatFileSize(node.size)} · ` : ""}
                {node.modifiedAt ? formatDate(node.modifiedAt) : ""}
              </span>
              {renderTags(node.path)}
              {options.snippet && (
                <span className={styles.fileMeta} style={{ fontStyle: "italic" }}>
                  {options.matchedIn === "handwriting" && "✍️ in deiner Handschrift erkannt · "}
                  {options.page ? `Seite ${options.page}: ` : ""}„{options.snippet}“
                </span>
              )}
            </div>
          )}
          {!isRenaming && (
            <div className={styles.fileActions}>
              {favoriteButton(node.path)}
              <button
                className={`${styles.smallButton} ${styles.hideOnMobile}`}
                onClick={() => toggleShare(node.path)}
              >
                Teilen
              </button>
              <ActionMenu items={menuItems} />
            </div>
          )}
        </div>
        {activeSharePath === node.path && (
          <div style={{ padding: "0 16px 16px" }}>
            <ShareForm path={node.path} onClose={() => setActiveSharePath(null)} />
          </div>
        )}
      </Fragment>
    );
  }

  function renderFolderRow(node: TreeNode) {
    const isRenaming = renamingPath === node.path;
    const isBusy = busyPath === node.path;
    const count = node.children?.length ?? 0;
    const menuItems: (ActionMenuItem | "divider")[] = [
      { label: "Als ZIP herunterladen", icon: "🗜", href: downloadZipUrl(node.path) },
      { label: "Als eine PDF herunterladen", icon: "📑", href: downloadPdfUrl(node.path) },
      { label: "Ordner teilen", icon: "📤", onClick: () => toggleShare(node.path) },
      {
        label: "Upload-Link erstellen",
        icon: "📥",
        onClick: () => {
          setActiveSharePath(null);
          setUploadLinkPath(node.path);
        },
      },
      { label: "Tags …", icon: "🏷", onClick: () => setTagPickerPath(node.path) },
      { label: "Umbenennen", icon: "✏️", onClick: () => startRename(node.path, node.name) },
      "divider",
      {
        label: "In den Papierkorb",
        icon: "🗑",
        danger: true,
        disabled: isBusy,
        onClick: () => handleDelete(node.path, true),
      },
    ];
    return (
      <Fragment key={node.path}>
        <div className={styles.fileRow}>
          {mode === "browse" && (
            <input
              type="checkbox"
              checked={selected.has(node.path)}
              onChange={() => toggleSelect(node.path)}
              aria-label={`${node.name} auswählen`}
            />
          )}
          <div className={styles.fileIconFolder}>📁</div>
          {isRenaming ? (
            <div className={styles.fileMain}>{renderRenameInput(node.path)}</div>
          ) : (
            <div
              className={styles.fileMainClickable}
              onClick={() => navigateTo([...segments, node.name])}
            >
              <span className={styles.fileNameText}>{node.name}</span>
              <span className={styles.fileMeta}>
                {mode !== "browse" ? `${node.path} · ` : ""}
                {count} {count === 1 ? "Eintrag" : "Einträge"}
              </span>
              {renderTags(node.path)}
            </div>
          )}
          {!isRenaming && (
            <div className={styles.fileActions}>
              {favoriteButton(node.path)}
              <ActionMenu items={menuItems} />
            </div>
          )}
        </div>
        {activeSharePath === node.path && (
          <div style={{ padding: "0 16px 16px" }}>
            <ShareForm path={node.path} onClose={() => setActiveSharePath(null)} />
          </div>
        )}
        {uploadLinkPath === node.path && (
          <div style={{ padding: "0 16px 16px" }}>
            <UploadLinkForm path={node.path} onClose={() => setUploadLinkPath(null)} />
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
          else openFile(node);
        }}
      >
        {selectable && (
          <input
            type="checkbox"
            className={styles.gridCheckbox}
            checked={selected.has(node.path)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelect(node.path)}
            aria-label={`${node.name} auswählen`}
          />
        )}
        <div className={styles.gridThumb}>
          {node.type === "folder" ? (
            "📁"
          ) : isPdf(node.name) ? (
            <>
              {/* Stays visible underneath while the thumbnail is still being
                  rendered (first view of a PDF takes a moment) or if it fails. */}
              📄
              {/* eslint-disable-next-line @next/next/no-img-element -- backend-generated thumbnail, not a static asset */}
              <img
                src={thumbnailUrl(node.path)}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </>
          ) : (
            "📄"
          )}
        </div>
        <span className={styles.gridName} title={node.name}>
          {node.name.replace(/\.pdf$/i, "")}
        </span>
      </div>
    );
  }

  if (error) {
    return <div className={styles.errorBox}>{error}</div>;
  }

  if (!tree) {
    return <LoadingState text="Notizen werden geladen …" />;
  }

  const searchBar = (
    <>
      <form
        onSubmit={handleSearchSubmit}
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
        role="search"
      >
        <div className={styles.searchField}>
          <span className={styles.searchIcon}>🔎</span>
          <input
            className={styles.input}
            placeholder="Notizen durchsuchen …"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Notizen durchsuchen"
          />
        </div>
        <button
          className={styles.button}
          type="submit"
          disabled={searching || !searchQuery.trim()}
          style={{ padding: "0 18px" }}
        >
          {searching ? "Sucht …" : "Suchen"}
        </button>
      </form>
      <div className={styles.chipRow}>
        <button
          type="button"
          className={mode === "browse" ? styles.chipActive : styles.chip}
          onClick={() => navigateTo(segments)}
        >
          📒 Alle Notizen
        </button>
        <button
          type="button"
          className={mode === "favorites" ? styles.chipActive : styles.chip}
          onClick={() => setMode(mode === "favorites" ? "browse" : "favorites")}
        >
          ★ Favoriten
        </button>
        <button
          type="button"
          className={mode === "recent" ? styles.chipActive : styles.chip}
          onClick={() => setMode(mode === "recent" ? "browse" : "recent")}
        >
          🕓 Neu (7 Tage)
        </button>
        {tags.map((tag) => {
          const active = mode === "tag" && activeTagId === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              className={active ? styles.chipActive : styles.chip}
              data-color={tag.color}
              onClick={() => {
                if (active) {
                  setMode("browse");
                  setActiveTagId(null);
                } else {
                  setActiveTagId(tag.id);
                  setMode("tag");
                }
              }}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
    </>
  );

  const statsBar = stats && mode === "browse" && segments.length === 0 && (
    <div className={styles.statsTiles}>
      <div className={styles.statTile}>
        <div className={styles.statTileValue}>{stats.totalFiles}</div>
        <div className={styles.statTileLabel}>Notizen</div>
      </div>
      <div className={styles.statTile}>
        <div className={styles.statTileValue}>{formatFileSize(stats.totalSize)}</div>
        <div className={styles.statTileLabel}>
          {stats.quotaBytes ? `von ${formatFileSize(stats.quotaBytes)} belegt` : "Speicher"}
        </div>
        {stats.quotaBytes && (
          <div className={styles.progressTrack} style={{ marginTop: 6, height: 4 }}>
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.min(100, (stats.totalSize / stats.quotaBytes) * 100)}%`,
                background:
                  stats.totalSize / stats.quotaBytes > 0.9 ? "var(--danger)" : undefined,
              }}
            />
          </div>
        )}
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
        <h2 className={styles.sectionTitle}>Ältere Versionen</h2>
        <p className={styles.hint} style={{ marginBottom: 16 }}>
          {versionsPath} — bevor GoodNotes eine Notiz überschreibt, wird die
          vorherige Fassung automatisch aufbewahrt.
        </p>
        {versions === null ? (
          <LoadingState />
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
                    className={styles.iconButton}
                    href={versionDownloadUrl(versionsPath, v.timestamp)}
                    title="Herunterladen"
                    aria-label="Herunterladen"
                  >
                    ⬇
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

  const overlays = (
    <>
      {tagPickerPath && (
        <TagPicker
          path={tagPickerPath}
          tags={tags}
          assigned={tagAssignments[tagPickerPath] ?? []}
          onToggle={(tagId, on) => toggleTag(tagPickerPath, tagId, on)}
          onTagsChanged={handleTagsChanged}
          onClose={() => setTagPickerPath(null)}
        />
      )}
      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className={styles.toastAction} onClick={toast.action}>
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => setToast(null)}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
      )}
      {previewPath && (
        <PdfPreviewModal
          path={previewPath}
          initialPage={previewPage}
          onClose={() => setPreviewPath(null)}
        />
      )}
      {formatHintPath && (
        <div className={styles.modalOverlay} onClick={() => setFormatHintPath(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.emptyIllustration} style={{ textAlign: "center" }}>
              📓
            </div>
            <h2 className={styles.sectionTitle} style={{ marginBottom: 8 }}>
              Das ist eine GoodNotes-Datei, kein PDF
            </h2>
            <p className={styles.hint} style={{ marginBottom: 12, fontSize: 14 }}>
              „{formatHintPath.split("/").pop()}“ liegt im GoodNotes-eigenen Format
              vor. Das kann nur die GoodNotes-App öffnen — kein Browser kann es
              anzeigen.
            </p>
            <p className={styles.hint} style={{ marginBottom: 20, fontSize: 14 }}>
              <strong style={{ color: "var(--foreground)" }}>So klappt die Vorschau:</strong>{" "}
              Stell in GoodNotes unter Einstellungen → Backup das{" "}
              <strong style={{ color: "var(--foreground)" }}>Backup-Format auf „PDF“</strong>{" "}
              um. Ab dem nächsten Backup kannst du alle Notizen hier ansehen und
              durchsuchen.
            </p>
            <div className={styles.actionRowInline}>
              <a className={styles.buttonSecondary} href={downloadFileUrl(formatHintPath)}>
                Trotzdem herunterladen
              </a>
              <button className={styles.button} onClick={() => setFormatHintPath(null)}>
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
      {versionsModal}
    </>
  );

  if (mode === "search") {
    return (
      <div>
        {searchBar}
        <div className={styles.toolbar}>
          <div className={styles.hint}>
            {searchResults?.length ?? 0} Treffer für „{searchQuery}“
            {indexStatus && indexStatus.indexed < indexStatus.pdfCount && (
              <> · Texterkennung läuft noch ({indexStatus.indexed} von {indexStatus.pdfCount} Notizen durchsucht)</>
            )}
          </div>
        </div>
        {searchResults && searchResults.length > 0 ? (
          <div className={styles.fileList}>
            {searchResults.map((r) =>
              renderFileRow(r, { snippet: r.snippet, page: r.page, matchedIn: r.matchedIn })
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration}>🔍</div>
            Nichts gefunden. Versuch es mit einem anderen Wort.
          </div>
        )}
        {overlays}
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
        </div>
        {favoriteFiles.length > 0 ? (
          <div className={styles.fileList}>{favoriteFiles.map((f) => renderFileRow(f))}</div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration}>⭐</div>
            Noch keine Favoriten — tippe bei einer Notiz auf ☆, um sie hier zu sammeln.
          </div>
        )}
        {overlays}
      </div>
    );
  }

  if (mode === "tag" && activeTagId) {
    const tag = tags.find((t) => t.id === activeTagId);
    const tagged = flattenAll(tree).filter((n) => (tagAssignments[n.path] ?? []).includes(activeTagId));
    return (
      <div>
        {searchBar}
        <div className={styles.toolbar}>
          <div className={styles.hint}>
            {tagged.length} {tagged.length === 1 ? "Eintrag" : "Einträge"} mit „{tag?.name}“
          </div>
        </div>
        {tagged.length > 0 ? (
          <div className={styles.fileList}>
            {tagged.map((n) => (n.type === "folder" ? renderFolderRow(n) : renderFileRow(n)))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration}>🏷</div>
            Noch nichts mit diesem Tag — vergib ihn über „⋯“ → „Tags …“.
          </div>
        )}
        {overlays}
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
            {recentFiles.length} {recentFiles.length === 1 ? "Notiz" : "Notizen"} der letzten 7 Tage
          </div>
        </div>
        {recentFiles.length > 0 ? (
          <div className={styles.fileList}>{recentFiles.map((f) => renderFileRow(f))}</div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIllustration}>🌙</div>
            In den letzten 7 Tagen ist nichts Neues dazugekommen.
          </div>
        )}
        {overlays}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className={styles.emptyState} style={{ padding: "24px 8px" }}>
        <div className={styles.emptyIllustration}>📭</div>
        <h2 className={styles.sectionTitle} style={{ color: "var(--foreground)", marginBottom: 8 }}>
          Noch keine Notizen da
        </h2>
        <p className={styles.hint} style={{ maxWidth: 440, margin: "0 auto 20px" }}>
          Sobald GoodNotes sein erstes Backup hierher geschickt hat, erscheinen
          deine Notizbücher automatisch auf dieser Seite. Dafür musst du GoodNotes
          einmalig mit deinem Konto verbinden — das dauert etwa zwei Minuten.
        </p>
        <div className={styles.heroActions}>
          <Link href="/dashboard/webdav" className={styles.button}>
            GoodNotes jetzt verbinden
          </Link>
          <button type="button" className={styles.buttonSecondary} onClick={openTour}>
            Wie funktioniert das?
          </button>
        </div>
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
      <div className={styles.breadcrumb} style={{ marginBottom: 12 }}>
        <span className={styles.breadcrumbLink} onClick={() => navigateTo([])}>
          Meine Notizen
        </span>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <span key={index} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span>›</span>
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

      <div className={styles.toolbar} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className={styles.segmented} role="group" aria-label="Sortierung">
            <button
              className={sortBy === "name" ? styles.segmentedItemActive : styles.segmentedItem}
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
              className={sortBy === "date" ? styles.segmentedItemActive : styles.segmentedItem}
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
          </div>
          <div className={styles.segmented} role="group" aria-label="Ansicht">
            <button
              className={viewMode === "list" ? styles.segmentedItemActive : styles.segmentedItem}
              onClick={() => setViewMode("list")}
              title="Liste"
            >
              ☰ Liste
            </button>
            <button
              className={viewMode === "grid" ? styles.segmentedItemActive : styles.segmentedItem}
              onClick={() => setViewMode("grid")}
              title="Raster mit Vorschaubildern"
            >
              ▦ Raster
            </button>
          </div>
        </div>
        <ActionMenu
          trigger={<>⬇ Exportieren & teilen ▾</>}
          items={[
            { label: "Als ZIP herunterladen", icon: "🗜", href: downloadZipUrl(currentPath) },
            { label: "Als eine PDF herunterladen", icon: "📑", href: downloadPdfUrl(currentPath) },
            {
              label: segments.length ? "Ordner teilen" : "Alles teilen",
              icon: "📤",
              onClick: () => toggleShare(currentPath || "."),
            },
            {
              label: "Upload-Link für diesen Ordner",
              icon: "📥",
              onClick: () => setUploadLinkPath(currentPath),
            },
          ]}
        />
      </div>

      {selected.size > 0 && (
        <div className={styles.toolbar} style={{ background: "var(--accent-soft)", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
          <div className={styles.hint} style={{ fontWeight: 600, color: "var(--accent)" }}>
            {selected.size} ausgewählt
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              className={styles.smallButtonAccent}
              href={downloadZipMultiUrl(Array.from(selected))}
            >
              Als ZIP
            </a>
            <button className={styles.smallButton} onClick={() => setBulkSharing(true)}>
              Teilen
            </button>
            <button className={styles.smallButton} onClick={() => setSelected(new Set())}>
              Aufheben
            </button>
          </div>
        </div>
      )}

      {bulkSharing && selected.size > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ShareForm paths={Array.from(selected)} onClose={() => setBulkSharing(false)} />
        </div>
      )}

      {uploadLinkPath === currentPath && (
        <div style={{ marginBottom: 20 }}>
          <UploadLinkForm path={currentPath} onClose={() => setUploadLinkPath(null)} />
        </div>
      )}

      {activeSharePath === (currentPath || ".") && (
        <div style={{ marginBottom: 20 }}>
          <ShareForm path={currentPath || "."} onClose={() => setActiveSharePath(null)} />
        </div>
      )}

      {children.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIllustration}>🗂</div>
          Dieser Ordner ist leer.
        </div>
      ) : viewMode === "grid" ? (
        <div className={styles.gridList}>
          {children.map((node) => renderGridItem(node, true))}
        </div>
      ) : (
        <div className={styles.fileList}>
          {children.map((node) =>
            node.type === "file"
              ? renderFileRow(node, { selectable: true })
              : renderFolderRow(node)
          )}
        </div>
      )}

      {overlays}
    </div>
  );
}
