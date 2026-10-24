"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { LoadingState } from "../../../components/LoadingState";
import {
  ApiError,
  approveUser,
  createAnnouncement,
  deleteAnnouncement,
  fetchAdminAnnouncements,
  fetchAdminUsers,
  fetchCurrentRepository,
  rejectUser,
  setUserQuota,
  fetchAdminAudit,
  type AuditEntry,
  type AdminUser,
  type Announcement,
} from "../../../lib/api";
import { formatDate, formatFileSize, formatRelative } from "../../../lib/format";
import { AuditList } from "../../../components/AuditList";
import styles from "../../ui.module.css";

function statusLabel(status: AdminUser["approvalStatus"]): string {
  if (status === "approved") return "Freigeschaltet";
  if (status === "rejected") return "Abgelehnt";
  return "Wartet auf Freigabe";
}

export default function AdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [defaultQuota, setDefaultQuota] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  function load() {
    fetchAdminUsers()
      .then((res) => {
        setUsers(res.users);
        setDefaultQuota(res.defaultQuotaBytes);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Konten konnten nicht geladen werden.")
      );
    fetchAdminAudit()
      .then((res) => setAudit(res.entries))
      .catch(() => setAudit([]));
    fetchAdminAnnouncements()
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => setAnnouncements([]));
  }

  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setCreating(true);
    setAnnouncementError(null);
    try {
      const created = await createAnnouncement(newMessage.trim());
      setAnnouncements((current) => [created, ...(current ?? [])]);
      setNewMessage("");
    } catch (err) {
      setAnnouncementError(
        err instanceof ApiError ? err.message : "Nachricht konnte nicht erstellt werden."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleQuota(user: AdminUser) {
    const current = user.quotaBytes ? String(Math.round(user.quotaBytes / 1024 / 1024)) : "";
    const input = window.prompt(
      `Speicherlimit für „${user.name}“ in MB (leer lassen = ${
        defaultQuota ? `Server-Standard, ${formatFileSize(defaultQuota)}` : "kein Limit"
      }):`,
      current
    );
    if (input === null) return;
    const trimmed = input.trim();
    const mb = trimmed === "" ? null : Number(trimmed);
    if (mb !== null && (!Number.isInteger(mb) || mb < 1)) {
      window.alert("Bitte eine ganze Zahl in MB angeben.");
      return;
    }
    setBusyId(user.id);
    try {
      const res = await setUserQuota(user.id, mb);
      setUsers((list) =>
        list?.map((u) =>
          u.id === user.id
            ? { ...u, quotaBytes: res.quotaBytes, effectiveQuotaBytes: res.effectiveQuotaBytes }
            : u
        ) ?? null
      );
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Speichern ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    setDeletingId(id);
    try {
      await deleteAnnouncement(id);
      setAnnouncements((current) => current?.filter((a) => a.id !== id) ?? null);
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Löschen ist fehlgeschlagen.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    fetchCurrentRepository()
      .then((session) => {
        if (!session.isAdmin) {
          router.replace("/dashboard");
          return;
        }
        load();
      })
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await approveUser(id);
      setUsers(
        (current) =>
          current?.map((u) => (u.id === id ? { ...u, approvalStatus: "approved" } : u)) ?? null
      );
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Freischalten ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    if (!window.confirm("Dieses Konto ablehnen? Es kann sich dann nicht anmelden oder synchronisieren.")) {
      return;
    }
    setBusyId(id);
    try {
      await rejectUser(id);
      setUsers(
        (current) =>
          current?.map((u) => (u.id === id ? { ...u, approvalStatus: "rejected" } : u)) ?? null
      );
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Ablehnen ist fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  if (checking || !users) {
    return (
      <div className={styles.shell}>
        <PageHeader app />
        <main className={styles.main}>
          <Link href="/dashboard" className={styles.backLink}>
            ← Zurück zu meinen Notizen
          </Link>
          <section className={styles.card}>
            <LoadingState />
          </section>
        </main>
      </div>
    );
  }

  const pending = users.filter((u) => u.approvalStatus === "pending");
  const others = users.filter((u) => u.approvalStatus !== "pending");

  return (
    <div className={styles.shell}>
      <PageHeader app />
      <main className={styles.main}>
        <Link href="/dashboard" className={styles.backLink}>
          ← Zurück zu meinen Notizen
        </Link>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Verwaltung</div>
          <h1 className={styles.title}>Neue Konten freischalten</h1>
          <p className={styles.subtitle}>
            Um Überlastung zu vermeiden, muss jedes neue Konto auf diesem
            Server erst von dir geprüft werden, bevor es sich anmelden oder
            mit GoodNotes synchronisieren kann.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          {pending.length === 0 ? (
            <div className={styles.emptyState}>Aktuell wartet niemand auf Freischaltung.</div>
          ) : (
            <div className={styles.fileList}>
              {pending.map((user) => (
                <div className={styles.fileRow} key={user.id}>
                  <div className={styles.fileIcon}>⏳</div>
                  <div className={styles.fileMain}>
                    <span className={styles.fileNameText}>{user.name}</span>
                    <span className={styles.fileMeta}>
                      {user.email} · angefragt am {formatDate(user.createdAt)}
                    </span>
                  </div>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.smallButtonAccent}
                      onClick={() => handleApprove(user.id)}
                      disabled={busyId === user.id}
                    >
                      Freischalten
                    </button>
                    <button
                      className={styles.smallButton}
                      onClick={() => handleReject(user.id)}
                      disabled={busyId === user.id}
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.eyebrow}>Verwaltung</div>
          <h1 className={styles.title}>Hinweise für alle Besucher</h1>
          <p className={styles.subtitle}>
            Nachrichten hier erscheinen oben auf jeder Seite, auch für Leute,
            die noch nicht angemeldet sind — z. B. für eine angekündigte
            Wartung oder einen rechtlichen Hinweis. Jede Person kann eine
            Nachricht für sich ausblenden; sie verschwindet erst für alle,
            wenn du sie hier löschst.
          </p>

          {announcementError && <div className={styles.errorBox}>{announcementError}</div>}

          <form onSubmit={handleCreateAnnouncement} className={styles.actionRowInline} style={{ marginBottom: 20 }}>
            <input
              className={styles.input}
              placeholder="z. B. Am Samstag ist der Server kurz offline (Wartung)."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              maxLength={500}
              style={{ flex: 1, minWidth: 240 }}
            />
            <button className={styles.button} type="submit" disabled={creating}>
              {creating ? "Wird erstellt …" : "Veröffentlichen"}
            </button>
          </form>

          {!announcements || announcements.length === 0 ? (
            <div className={styles.emptyState}>Aktuell ist keine Nachricht veröffentlicht.</div>
          ) : (
            <div className={styles.fileList}>
              {announcements.map((a) => (
                <div className={styles.fileRow} key={a.id}>
                  <div className={styles.fileIcon}>📣</div>
                  <div className={styles.fileMain}>
                    <span className={styles.fileNameText}>{a.message}</span>
                    <span className={styles.fileMeta}>seit {formatDate(a.createdAt)}</span>
                  </div>
                  <div className={styles.fileActions}>
                    <button
                      className={styles.smallButton}
                      onClick={() => handleDeleteAnnouncement(a.id)}
                      disabled={deletingId === a.id}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Alle Konten</h2>
          <div className={styles.fileList}>
            {others.map((user) => (
              <div className={styles.fileRow} key={user.id}>
                <div className={styles.fileIcon}>{user.isAdmin ? "👑" : "👤"}</div>
                <div className={styles.fileMain}>
                  <span className={styles.fileNameText}>
                    {user.name} {user.isAdmin && "(Admin)"}
                  </span>
                  <span className={styles.fileMeta}>
                    {user.email} · {statusLabel(user.approvalStatus)} · seit{" "}
                    {formatDate(user.createdAt)}
                    {user.lastBackupAt && ` · zuletzt gesichert ${formatRelative(user.lastBackupAt)}`}
                  </span>
                  <span className={styles.fileMeta}>
                    {formatFileSize(user.usageBytes)} belegt
                    {user.effectiveQuotaBytes
                      ? ` von ${formatFileSize(user.effectiveQuotaBytes)}${user.quotaBytes ? "" : " (Standard)"}`
                      : " · kein Limit"}
                  </span>
                  {user.effectiveQuotaBytes && (
                    <div className={styles.progressTrack} style={{ marginTop: 4, height: 4, maxWidth: 240 }}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${Math.min(100, (user.usageBytes / user.effectiveQuotaBytes) * 100)}%`,
                          background:
                            user.usageBytes / user.effectiveQuotaBytes > 0.9 ? "var(--danger)" : undefined,
                        }}
                      />
                    </div>
                  )}
                </div>
                <button
                  className={styles.smallButton}
                  onClick={() => handleQuota(user)}
                  disabled={busyId === user.id}
                >
                  Limit
                </button>
                {!user.isAdmin && (
                  <div className={styles.fileActions}>
                    {user.approvalStatus === "rejected" ? (
                      <button
                        className={styles.smallButton}
                        onClick={() => handleApprove(user.id)}
                        disabled={busyId === user.id}
                      >
                        Doch freischalten
                      </button>
                    ) : (
                      <button
                        className={styles.smallButton}
                        onClick={() => handleReject(user.id)}
                        disabled={busyId === user.id}
                      >
                        Zugang entziehen
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Protokoll aller Konten</h2>
          <p className={styles.hint} style={{ marginBottom: 16 }}>
            Anmeldungen, fehlgeschlagene Versuche, Freigaben und Löschungen auf
            diesem Server — neueste zuerst.
          </p>
          {audit ? <AuditList entries={audit} showAccount /> : <LoadingState />}
        </section>
      </main>
    </div>
  );
}
