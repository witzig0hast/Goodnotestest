"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../app/ui.module.css";

const ITEMS = [
  { href: "/dashboard/webdav", label: "GoodNotes verbinden", icon: "🔗" },
  { href: "/dashboard/sicherheit", label: "Anmeldung & Sicherheit", icon: "🔐" },
  { href: "/dashboard/freigaben", label: "Meine Freigaben", icon: "📤" },
  { href: "/dashboard/benachrichtigungen", label: "Backup-Erinnerung", icon: "🔔" },
  { href: "/dashboard/nextcloud", label: "Nextcloud", icon: "☁️" },
  { href: "/dashboard/kurzbefehl", label: "iOS-Kurzbefehl", icon: "⚡" },
];

export function SettingsMenu({
  isAdmin = false,
  onLogout,
}: {
  isAdmin?: boolean;
  onLogout?: () => void;
}) {
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
        title="Einstellungen"
      >
        ⚙️ <span className={styles.navLabel}>Einstellungen</span>
      </button>
      {open && (
        <div className={styles.menuPanel} role="menu">
          <div className={styles.menuHeading}>Einstellungen</div>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={styles.menuItem}
              role="menuitem"
              style={pathname === item.href ? { color: "var(--accent)" } : undefined}
            >
              <span className={styles.menuIcon}>{item.icon}</span>
              {item.label}
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
                <span className={styles.menuIcon}>👑</span>
                Verwaltung
              </Link>
            </>
          )}
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
                <span className={styles.menuIcon}>↩</span>
                Abmelden
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
