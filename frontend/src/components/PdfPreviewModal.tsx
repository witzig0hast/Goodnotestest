"use client";

import { previewFileUrl } from "../lib/api";
import styles from "../app/ui.module.css";

export function PdfPreviewModal({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 20, 15, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
        animation: "fadeIn 0.2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 900,
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "scaleIn 0.2s ease both",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong
            style={{
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {path.split("/").pop()}
          </strong>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Mobile browsers (iOS Safari especially) often only render the
                first page of an embedded PDF — a full tab shows all of it. */}
            <a
              href={previewFileUrl(path)}
              target="_blank"
              rel="noreferrer"
              className={styles.smallButton}
            >
              In neuem Tab öffnen
            </a>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "var(--muted)",
                lineHeight: 1,
              }}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
        </div>
        <object
          data={previewFileUrl(path)}
          type="application/pdf"
          style={{ flex: 1, width: "100%" }}
        >
          <p style={{ padding: 20 }}>
            Vorschau wird von diesem Browser nicht unterstützt.{" "}
            <a
              href={previewFileUrl(path)}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline" }}
            >
              Datei stattdessen öffnen
            </a>
            .
          </p>
        </object>
      </div>
    </div>
  );
}
