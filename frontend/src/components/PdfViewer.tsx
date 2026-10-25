"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import styles from "../app/ui.module.css";
import { translate, useT } from "../lib/i18n";

// pdf.js is large — load it only when someone actually opens a PDF.
// The "legacy" build also runs on older iPad/iPhone Safari versions.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

// Device-pixel ratio is capped: a 3x iPhone rendering every page at full
// resolution would allocate hundreds of MB for a long notebook.
const MAX_PIXEL_RATIO = 2;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function PdfPage({
  doc,
  pageNumber,
  width,
  aspectRatio,
  onVisible,
  registerElement,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  aspectRatio: number;
  onVisible: (page: number) => void;
  registerElement: (page: number, el: HTMLDivElement | null) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(aspectRatio);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    registerElement(pageNumber, el);
    // Two observers: a generous one decides whether this page should hold
    // a rendered canvas at all (pages far away are released again), a
    // tight one reports which page is "current" for the page counter.
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (!entry.isIntersecting) setRendered(false);
      },
      { rootMargin: "150% 0px" }
    );
    const currentObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible(pageNumber);
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    nearObserver.observe(el);
    currentObserver.observe(el);
    return () => {
      nearObserver.disconnect();
      currentObserver.disconnect();
      registerElement(pageNumber, null);
    };
  }, [pageNumber, onVisible, registerElement]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!near) {
      // Free the bitmap memory of pages that scrolled far out of view.
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      task.promise
        .then(() => {
          if (!cancelled) setRendered(true);
        })
        .catch(() => {
          // RenderingCancelledException when zooming/scrolling quickly
        });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width, near]);

  return (
    <div
      ref={wrapperRef}
      className={styles.pdfPage}
      style={{ width, height: Math.round(width * ratio) }}
      data-page={pageNumber}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", opacity: rendered ? 1 : 0 }}
        aria-label={`Seite ${pageNumber}`}
      />
      {!rendered && <span className={styles.spinner} style={{ position: "absolute" }} />}
    </div>
  );
}

function PdfThumbnail({
  doc,
  pageNumber,
  active,
  onClick,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active) buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 180 / base.width });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, visible]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={active ? styles.pdfThumbActive : styles.pdfThumb}
      onClick={onClick}
      aria-label={`Zu Seite ${pageNumber}`}
    >
      <canvas ref={canvasRef} />
      <span>{pageNumber}</span>
    </button>
  );
}

export function PdfViewer({
  url,
  title,
  downloadUrl,
  initialPage = 1,
  onClose,
}: {
  url: string;
  title: string;
  downloadUrl?: string;
  initialPage?: number;
  onClose: () => void;
}) {
  const t = useT();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState(1.414);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  // Thumbnails take too much room on a phone; start without them there.
  // (Only ever rendered client-side after a click, so window exists.)
  const [showThumbs, setShowThumbs] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 700
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElements = useRef(new Map<number, HTMLDivElement>());
  const jumpedInitially = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        // Fetched by hand (with the session cookie) instead of handing pdf.js
        // the URL, so it goes through exactly the same request as a
        // download and the API's CORS rules apply as usual.
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await loadPdfjs();
        loadingTask = pdfjs.getDocument({
          data,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          wasmUrl: "/pdfjs/wasm/",
        });
        const loaded = await loadingTask.promise;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspectRatio(vp.height / vp.width);
        setDoc(loaded);
      } catch {
        if (!cancelled) {
          setError(
            translate("Diese Datei konnte nicht als PDF geöffnet werden. Vielleicht ist sie beschädigt oder kein PDF.")
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const registerElement = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageElements.current.set(page, el);
    else pageElements.current.delete(page);
  }, []);

  const scrollToPage = useCallback((page: number, smooth = true) => {
    const el = pageElements.current.get(page);
    if (el) el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, []);

  useEffect(() => {
    if (!doc || jumpedInitially.current || initialPage <= 1) return;
    jumpedInitially.current = true;
    // wait one frame so the page placeholders exist
    requestAnimationFrame(() => scrollToPage(initialPage, false));
  }, [doc, initialPage, scrollToPage]);

  const zoomIn = useCallback(
    () => setZoom((z) => ZOOM_STEPS.find((s) => s > z + 0.001) ?? z),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? z),
    []
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, zoomIn, zoomOut]);

  // Fit-to-width at 100 %, but never wider than a comfortable reading
  // width on big screens.
  const baseWidth = Math.max(Math.min(containerWidth - 32, 900), 200);
  const pageWidth = Math.round(baseWidth * zoom);
  const pageCount = doc?.numPages ?? 0;

  return (
    <div className={styles.pdfViewerOverlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.pdfToolbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setShowThumbs((v) => !v)}
            title={t("Seitenübersicht")}
            aria-label={t("Seitenübersicht ein-/ausblenden")}
            disabled={!doc}
          >
            ▤
          </button>
          <strong className={styles.pdfTitle}>{title}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {pageCount > 0 && (
            <span className={styles.pdfPageCounter}>
              {currentPage} / {pageCount}
            </span>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={zoomOut}
            aria-label={t("Verkleinern")}
            title={t("Verkleinern (−)")}
          >
            −
          </button>
          <button
            type="button"
            className={`${styles.pdfZoomLabel} ${styles.hideOnMobile}`}
            onClick={() => setZoom(1)}
            title={t("Auf Breite einpassen")}
          >
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={zoomIn}
            aria-label={t("Vergrößern")}
            title={t("Vergrößern (+)")}
          >
            +
          </button>
          {downloadUrl && (
            <a
              className={styles.iconButton}
              href={downloadUrl}
              title={t("Herunterladen")}
              aria-label={t("Herunterladen")}
            >
              ⬇
            </a>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label={t("Schließen")}
            title={t("Schließen (Esc)")}
            style={{ fontSize: 22 }}
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.pdfBody}>
        {doc && showThumbs && (
          <div className={styles.pdfThumbs}>
            {Array.from({ length: pageCount }, (_, i) => (
              <PdfThumbnail
                key={i + 1}
                doc={doc}
                pageNumber={i + 1}
                active={currentPage === i + 1}
                onClick={() => scrollToPage(i + 1)}
              />
            ))}
          </div>
        )}
        <div ref={scrollRef} className={styles.pdfScroll}>
          {error ? (
            <div className={styles.pdfMessage}>
              <div className={styles.emptyIllustration}>📄</div>
              <p style={{ marginBottom: 16 }}>{error}</p>
              {downloadUrl && (
                <a href={downloadUrl} className={styles.button}>
                  {t("Stattdessen herunterladen")}
                </a>
              )}
            </div>
          ) : !doc ? (
            <div className={styles.pdfMessage}>
              <span className={styles.spinner} style={{ width: 28, height: 28 }} />
              <p style={{ marginTop: 12 }}>{t("PDF wird geladen …")}</p>
            </div>
          ) : (
            containerWidth > 0 &&
            Array.from({ length: pageCount }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                pageNumber={i + 1}
                width={pageWidth}
                aspectRatio={aspectRatio}
                onVisible={setCurrentPage}
                registerElement={registerElement}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
