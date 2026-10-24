"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import {
  ApiError,
  fetchUploadLinkInfo,
  unlockUploadLink,
  uploadViaLink,
  type UploadLinkInfo,
} from "../../../lib/api";
import { formatFileSize } from "../../../lib/format";
import styles from "../../ui.module.css";

interface QueuedFile {
  key: string;
  file: File;
  progress: number;
  state: "waiting" | "uploading" | "done" | "error";
  message?: string;
}

export default function UploadPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [info, setInfo] = useState<UploadLinkInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);

  useEffect(() => {
    fetchUploadLinkInfo(linkId)
      .then(setInfo)
      .catch(() => setNotFound(true));
  }, [linkId]);

  function update(key: string, patch: Partial<QueuedFile>) {
    setQueue((q) => q.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function runQueue(items: QueuedFile[]) {
    if (running.current) return;
    running.current = true;
    for (const item of items) {
      update(item.key, { state: "uploading" });
      try {
        const res = await uploadViaLink(linkId, item.file, token, (p) =>
          update(item.key, { progress: p })
        );
        update(item.key, {
          state: "done",
          progress: 1,
          message: res.name !== item.file.name ? `gespeichert als „${res.name}“` : undefined,
        });
        setInfo((i) => (i && i.filesLeft !== null ? { ...i, filesLeft: Math.max(0, i.filesLeft - 1) } : i));
      } catch (err) {
        update(item.key, {
          state: "error",
          message: err instanceof ApiError ? err.message : "Hochladen ist fehlgeschlagen.",
        });
      }
    }
    running.current = false;
  }

  function addFiles(files: FileList | null) {
    if (!files || !info) return;
    const items: QueuedFile[] = Array.from(files).map((file) => {
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
      const tooBig = file.size > info.maxFileMb * 1024 * 1024;
      const wrongType = !info.allowedExtensions.includes(ext);
      return {
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        progress: 0,
        state: tooBig || wrongType ? "error" : "waiting",
        message: tooBig
          ? `Größer als ${info.maxFileMb} MB`
          : wrongType
            ? "Dateityp nicht erlaubt"
            : undefined,
      };
    });
    setQueue((q) => [...q, ...items]);
    runQueue(items.filter((i) => i.state === "waiting"));
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    try {
      const res = await unlockUploadLink(linkId, password);
      setToken(res.token);
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.message : "Das hat nicht geklappt.");
    }
  }

  const shell = (content: React.ReactNode) => (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>{content}</main>
    </div>
  );

  if (notFound) {
    return shell(
      <section className={styles.card}>
        <div className={styles.emptyIllustration}>🔗</div>
        <h1 className={styles.title}>Upload-Link nicht gefunden</h1>
        <p className={styles.subtitle}>
          Dieser Link ist ungültig, abgelaufen oder wurde widerrufen. Bitte frag die
          Person, die ihn dir geschickt hat, nach einem neuen.
        </p>
      </section>
    );
  }
  if (!info) return shell(<section className={styles.card}><LoadingState /></section>);

  const locked = info.requiresPassword && !token;
  const full = info.filesLeft === 0;
  const doneCount = queue.filter((f) => f.state === "done").length;

  return shell(
    <section className={styles.card}>
      <div className={styles.eyebrow}>Dateien senden</div>
      <h1 className={styles.title}>{info.label ?? `An ${info.ownerName}`}</h1>
      <p className={styles.subtitle}>
        Deine Dateien landen bei <strong>{info.ownerName}</strong> im Ordner „{info.folderName}“.
        Du siehst dabei nichts, was dort schon liegt.
      </p>

      {locked ? (
        <form onSubmit={handleUnlock}>
          {unlockError && <div className={styles.errorBox} style={{ marginBottom: 16 }}>{unlockError}</div>}
          <div className={styles.field} style={{ marginBottom: 16 }}>
            <label className={styles.label} htmlFor="uploadPassword">
              Dieser Upload-Link ist mit einem Passwort geschützt
            </label>
            <input id="uploadPassword" className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          </div>
          <button className={styles.button} type="submit">Weiter</button>
        </form>
      ) : full && doneCount === 0 ? (
        <div className={styles.warningBox}>
          Über diesen Link wurden schon alle erlaubten Dateien hochgeladen.
        </div>
      ) : (
        <>
          <div
            className={dragging ? styles.dropZoneActive : styles.dropZone}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!full) addFiles(e.dataTransfer.files);
            }}
            onClick={() => !full && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 6 }}>📥</div>
            <strong>{full ? "Limit erreicht" : "Dateien hierher ziehen oder tippen zum Auswählen"}</strong>
            <div className={styles.hint} style={{ marginTop: 4 }}>
              PDF, Bilder, GoodNotes-Dateien · bis {info.maxFileMb} MB pro Datei
              {info.filesLeft !== null && ` · noch ${info.filesLeft} ${info.filesLeft === 1 ? "Datei" : "Dateien"}`}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={info.allowedExtensions.join(",")}
              style={{ display: "none" }}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {queue.length > 0 && (
            <div className={styles.fileList} style={{ marginTop: 16 }}>
              {queue.map((item) => (
                <div key={item.key} className={styles.fileRow}>
                  <div className={styles.fileIcon}>
                    {item.state === "done" ? "✅" : item.state === "error" ? "⚠️" : "📄"}
                  </div>
                  <div className={styles.fileMain}>
                    <span className={styles.fileNameText}>{item.file.name}</span>
                    <span className={styles.fileMeta} style={item.state === "error" ? { color: "var(--danger)" } : undefined}>
                      {formatFileSize(item.file.size)}
                      {item.state === "uploading" && ` · ${Math.round(item.progress * 100)} %`}
                      {item.state === "waiting" && " · wartet …"}
                      {item.state === "done" && ` · angekommen${item.message ? ` (${item.message})` : ""}`}
                      {item.state === "error" && ` · ${item.message}`}
                    </span>
                    {item.state === "uploading" && (
                      <div className={styles.progressTrack} style={{ marginTop: 6, height: 4 }}>
                        <div className={styles.progressFill} style={{ width: `${item.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {doneCount > 0 && (
            <p className={styles.hint} style={{ marginTop: 12 }}>
              ✓ {doneCount} {doneCount === 1 ? "Datei ist" : "Dateien sind"} bei {info.ownerName} angekommen.
            </p>
          )}
        </>
      )}
    </section>
  );
}
