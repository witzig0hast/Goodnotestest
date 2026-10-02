"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../app/ui.module.css";

const ITEMS = [
  { href: "/dashboard/webdav", label: "WebDAV-Zugang" },
  { href: "/dashboard/sicherheit", label: "Sicherheit" },
  { href: "/dashboard/benachrichtigungen", label: "Erinnerung" },
  { href: "/dashboard/nextcloud", label: "Nextcloud" },
  { href: "/dashboard/freigaben", label: "Freigaben" },
  { href: "/dashboard/kurzbefehl", label: "iOS-Kurzbefehl" },
];

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={styles.smallButton}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Einstellungen {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className={styles.menuPanel}>
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={styles.menuItem}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
