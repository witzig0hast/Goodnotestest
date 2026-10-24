// Merges the English dictionaries of every UI area into one lookup table.
import { enAuth } from "./en-auth";
import { enBrowser } from "./en-browser";
import { enShell } from "./en-shell";
import { enSettings } from "./en-settings";
import { enServer } from "./en-server";

export const en: Record<string, string> = {
  ...enServer,
  ...enAuth,
  ...enBrowser,
  ...enShell,
  ...enSettings,
};
