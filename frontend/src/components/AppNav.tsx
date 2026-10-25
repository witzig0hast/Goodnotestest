"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentRepository, logout } from "../lib/api";
import { clearOffline } from "../lib/offline";
import { SettingsMenu } from "./SettingsMenu";
import { OPEN_TOUR_EVENT, WelcomeTour } from "./WelcomeTour";
import { useT } from "../lib/i18n";
import styles from "../app/ui.module.css";
import { Icon } from "./Icon";

export function AppNav() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    // Every page behind the login already redirects to /login on its own
    // when the session is gone, so a failure here can be ignored — this
    // only decides whether to show the admin entry.
    fetchCurrentRepository()
      .then((session) => setIsAdmin(session.isAdmin))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const open = () => setTourOpen(true);
    window.addEventListener(OPEN_TOUR_EVENT, open);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, open);
  }, []);

  async function handleLogout() {
    // Offline copies are personal — never leave them behind on a shared device.
    await clearOffline();
    await logout().catch(() => {});
    router.replace("/login");
  }

  return (
    <nav className={styles.nav}>
      <Link
        href="/dashboard"
        className={pathname === "/dashboard" ? styles.navLinkActive : styles.navLink}
        title={t("Meine Notizen")}
      >
        <Icon name="book" /> <span className={styles.navLabel}>{t("Notizen")}</span>
      </Link>
      <button
        type="button"
        className={styles.navLink}
        onClick={() => setTourOpen(true)}
        title={t("Kurze Einführung anzeigen")}
      >
        <Icon name="help" /> <span className={styles.navLabel}>{t("Hilfe")}</span>
      </button>
      <SettingsMenu isAdmin={isAdmin} onLogout={handleLogout} />
      {tourOpen && <WelcomeTour onClose={() => setTourOpen(false)} />}
    </nav>
  );
}
