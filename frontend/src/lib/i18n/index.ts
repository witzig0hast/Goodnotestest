"use client";

import { useSyncExternalStore } from "react";
import { en } from "./en";

/**
 * Tiny i18n layer: the German UI text *is* the key. Components wrap their
 * strings in t("…"), and in English mode t() looks the German text up in
 * the English dictionary (./en-*.ts) — missing entries simply stay German,
 * so a forgotten string degrades gracefully instead of showing a key.
 *
 * Placeholders use {name}: t("Noch {n} Tage", { n: 3 }).
 *
 * The language is a per-browser choice (localStorage), defaulting to the
 * browser's language. Server rendering always uses German; the client
 * switches right after hydration, without a hydration mismatch, because
 * the choice is read through useSyncExternalStore with a German server
 * snapshot.
 */

export type Locale = "de" | "en";

const STORAGE_KEY = "goodshare.lang";
const listeners = new Set<() => void>();
let cached: Locale | null = null;

function detect(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch {
    // storage blocked
  }
  const lang = (navigator.languages?.[0] ?? navigator.language ?? "de").toLowerCase();
  return lang.startsWith("de") ? "de" : "en";
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "de";
  if (!cached) cached = detect();
  return cached;
}

export function setLocale(locale: Locale): void {
  cached = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // not remembered, but still switches for this page view
  }
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

// Server messages that end in a variable part ("Nicht gefunden: Ordner/x.pdf")
// can't be looked up exactly — only their fixed beginning is translated.
const EN_PREFIXES: [string, string][] = [
  ["Nicht gefunden: ", "Not found: "],
  ["Dieser Dateityp ist nicht erlaubt. Erlaubt sind: ", "This file type isn't allowed. Allowed are: "],
];

function lookupEnglish(text: string): string {
  if (text in en) return en[text];
  for (const [de, english] of EN_PREFIXES) {
    if (text.startsWith(de)) return english + text.slice(de.length);
  }
  return text;
}

/** Translates outside of React components (e.g. API error messages). */
export function translate(text: string, vars?: Record<string, string | number>, locale = getLocale()): string {
  const source = locale === "en" ? lookupEnglish(text) : text;
  return interpolate(source, vars);
}

export type Translate = (text: string, vars?: Record<string, string | number>) => string;

/** Returns t() for the current language and re-renders when it changes. */
export function useT(): Translate {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "de" as Locale);
  return (text, vars) => translate(text, vars, locale);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "de" as Locale);
}

/** BCP-47 tag for Intl/Date formatting in the current language. */
export function intlLocale(locale = getLocale()): string {
  return locale === "en" ? "en-GB" : "de-DE";
}
