"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  downloadFileUrl,
  downloadZipUrl,
  fetchTree,
  type TreeNode,
} from "../lib/api";
import { formatDate, formatFileSize } from "../lib/format";
import { ShareForm } from "./ShareControl";
import styles from "../app/ui.module.css";

function findChildrenAtPath(tree: TreeNode[], segments: string[]): TreeNode[] | null {
  if (segments.length === 0) return tree;
  const [head, ...rest] = segments;
  const match = tree.find((node) => node.type === "folder" && node.name === head);
  if (!match || !match.children) return null;
  return findChildrenAtPath(match.children, rest);
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

  useEffect(() => {
    fetchTree()
      .then((res) => setTree(res.tree))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Notizen konnten nicht geladen werden.")
      );
  }, []);

  function navigateTo(pathSegments: string[]) {
    const path = pathSegments.join("/");
    setActiveSharePath(null);
    router.push(path ? `/dashboard?path=${encodeURIComponent(path)}` : "/dashboard");
  }

  function toggleShare(path: string) {
    setActiveSharePath((current) => (current === path ? null : path));
  }

  if (error) {
    return <div className={styles.errorBox}>{error}</div>;
  }

  if (!tree) {
    return <p className={styles.hint}>Notizen werden geladen …</p>;
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
        <div style={{ display: "flex", gap: 8 }}>
          <a className={styles.smallButtonAccent} href={downloadZipUrl(currentPath)}>
            Diesen Ordner als ZIP herunterladen
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
          {children.map((node) => (
            <Fragment key={node.path}>
              <div className={styles.fileRow}>
                <div className={styles.fileIcon}>
                  {node.type === "folder" ? "📁" : "📄"}
                </div>
                <div
                  className={
                    node.type === "folder" ? styles.fileMainClickable : styles.fileMain
                  }
                  onClick={
                    node.type === "folder"
                      ? () => navigateTo([...segments, node.name])
                      : undefined
                  }
                >
                  <span className={styles.fileNameText}>{node.name}</span>
                  <span className={styles.fileMeta}>
                    {node.type === "folder"
                      ? `${node.children?.length ?? 0} Einträge`
                      : `${formatFileSize(node.size ?? 0)} · ${formatDate(node.modifiedAt!)}`}
                  </span>
                </div>
                <div className={styles.fileActions}>
                  {node.type === "file" ? (
                    <a className={styles.smallButton} href={downloadFileUrl(node.path)}>
                      Herunterladen
                    </a>
                  ) : (
                    <a className={styles.smallButton} href={downloadZipUrl(node.path)}>
                      Als ZIP
                    </a>
                  )}
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
          ))}
        </div>
      )}
    </div>
  );
}
