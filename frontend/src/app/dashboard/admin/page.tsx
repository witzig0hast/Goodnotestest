"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import {
  ApiError,
  approveUser,
  fetchAdminUsers,
  fetchCurrentRepository,
  rejectUser,
  type AdminUser,
} from "../../../lib/api";
import { formatDate } from "../../../lib/format";
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

  function load() {
    fetchAdminUsers()
      .then((res) => setUsers(res.users))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Konten konnten nicht geladen werden.")
      );
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
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.hint}>Wird geladen …</p>
          </section>
        </main>
      </div>
    );
  }

  const pending = users.filter((u) => u.approvalStatus === "pending");
  const others = users.filter((u) => u.approvalStatus !== "pending");

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
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
                  </span>
                </div>
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
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
        </section>
      </main>
    </div>
  );
}
