"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setLocale, useLocale, useT } from "../lib/i18n";
import styles from "../app/ui.module.css";
import { Icon, type IconName } from "./Icon";

const ITEMS = [
  { href: "/dashboard/webdav", label: "GoodNotes verbinden", icon: "link" as IconName },
  { href: "/dashboard/sicherheit", label: "Anmeldung & Sicherheit", icon: "lock" as IconName },
  { href: "/dashboard/freigaben", label: "Meine Freigaben", icon: "share" as IconName },
  { href: "/dashboard/papierkorb", label: "Papierkorb", icon: "trash" as IconName },
  { href: "/dashboard/aktivitaet", label: "Aktivität & Backups", icon: "activity" as IconName },
  { href: "/dashboard/benachrichtigungen", label: "Backup-Erinnerung", icon: "bell" as IconName },
  { href: "/dashboard/nextcloud", label: "Nextcloud", icon: "cloud" as IconName },
  { href: "/dashboard/kurzbefehl", label: "iOS-Kurzbefehl", icon: "zap" as IconName },
];

export function SettingsMenu({
  isAdmin = false,
  onLogout,
}: {
  isAdmin?: boolean;
  onLogout?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const onSettingsPage =
    pathname.startsWith("/dashboard/") && pathname !== "/dashboard/admin";

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={onSettingsPage || open ? styles.navLinkActive : styles.navLink}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("Einstellungen")}
      >
        <Icon name="settings" /> <span className={styles.navLabel}>{t("Einstellungen")}</span>
      </button>
      {open && (
        <div className={styles.menuPanel} role="menu">
          <div className={styles.menuHeading}>{t("Einstellungen")}</div>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={styles.menuItem}
              role="menuitem"
              style={pathname === item.href ? { color: "var(--accent)" } : undefined}
            >
              <span className={styles.menuIcon}><Icon name={item.icon} size={16} /></span>
              {t(item.label)}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className={styles.menuDivider} />
              <Link
                href="/dashboard/admin"
                onClick={() => setOpen(false)}
                className={styles.menuItem}
                role="menuitem"
              >
                <span className={styles.menuIcon}><Icon name="shield" size={16} /></span>
                {t("Verwaltung")}
              </Link>
            </>
          )}
          <div className={styles.menuDivider} />
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setLocale(locale === "de" ? "en" : "de")}
          >
            <span className={styles.menuIcon}><Icon name="globe" size={16} /></span>
            {locale === "de" ? "English" : "Deutsch"}
          </button>
          {onLogout && (
            <>
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={styles.menuItemDanger}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <span className={styles.menuIcon}><Icon name="logout" size={16} /></span>
                {t("Abmelden")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
