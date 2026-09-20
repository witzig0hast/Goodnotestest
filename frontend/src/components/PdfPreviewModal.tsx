"use client";

import { previewFileUrl } from "../lib/api";

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
          <strong style={{ fontSize: 14 }}>{path.split("/").pop()}</strong>
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
        <object
          data={previewFileUrl(path)}
          type="application/pdf"
          style={{ flex: 1, width: "100%" }}
        >
          <p style={{ padding: 20 }}>
            Vorschau wird von diesem Browser nicht unterstützt.{" "}
            <a href={previewFileUrl(path)} target="_blank" rel="noreferrer">
              Datei stattdessen öffnen
            </a>
            .
          </p>
        </object>
      </div>
    </div>
  );
}
