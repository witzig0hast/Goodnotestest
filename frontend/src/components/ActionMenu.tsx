"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../app/ui.module.css";
import { Icon, type IconName } from "./Icon";

export interface ActionMenuItem {
  label: string;
  icon: IconName;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

// A compact "⋯" overflow menu, so a file row needs one button instead of
// seven — the old row of buttons pushed file names to "Ei…" on desktop
// and off-screen entirely on phones.
export function ActionMenu({
  items,
  label = "Weitere Aktionen",
  trigger,
}: {
  items: (ActionMenuItem | "divider")[];
  label?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      {trigger ? (
        <button
          type="button"
          className={styles.smallButton}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={label}
          title={label}
          style={open ? { background: "var(--surface)", color: "var(--accent)" } : undefined}
        >
          ⋯
        </button>
      )}
      {open && (
        <div className={styles.menuPanel} role="menu">
          {items.map((item, index) => {
            if (item === "divider") return <div key={`d${index}`} className={styles.menuDivider} />;
            const className = item.danger ? styles.menuItemDanger : styles.menuItem;
            const content = (
              <>
                <span className={styles.menuIcon}><Icon name={item.icon} size={16} /></span>
                {item.label}
              </>
            );
            return item.href ? (
              <a
                key={item.label}
                href={item.href}
                className={className}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {content}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                className={className}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
