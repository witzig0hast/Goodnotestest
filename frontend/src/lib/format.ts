export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

import { intlLocale, translate } from "./i18n";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "vor 3 Minuten", "gestern", … — for status lines where the exact time matters less. */
export function formatRelative(iso: string): string {
  const diffSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" });
  if (diffSeconds < 60) return translate("gerade eben");
  if (diffSeconds < 3600) return rtf.format(-Math.round(diffSeconds / 60), "minute");
  if (diffSeconds < 86400) return rtf.format(-Math.round(diffSeconds / 3600), "hour");
  return rtf.format(-Math.round(diffSeconds / 86400), "day");
}
