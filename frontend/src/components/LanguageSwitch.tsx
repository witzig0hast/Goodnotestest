"use client";

import { useEffect } from "react";
import { setLocale, useLocale } from "../lib/i18n";
import styles from "../app/ui.module.css";

/** Keeps <html lang> in sync with the chosen language. */
export function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

/** Small DE | EN toggle for pages without the settings menu. */
export function LanguageSwitch() {
  const locale = useLocale();
  return (
    <div className={styles.langSwitch} role="group" aria-label="Sprache / Language">
      {(["de", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          className={locale === l ? styles.langSwitchActive : styles.langSwitchItem}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
