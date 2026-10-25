import type { IconName } from "../components/Icon";

// Human-readable labels for the audit log's action codes (see the
// backend's lib/audit.ts).
export const AUDIT_LABELS: Record<string, { icon: IconName; label: string }> = {
  "login.password": { icon: "key", label: "Anmeldung mit Passwort" },
  "login.passkey": { icon: "key", label: "Anmeldung mit Passkey" },
  "login.code": { icon: "key", label: "Anmeldung mit Notfall-Code" },
  "login.sso": { icon: "key", label: "Anmeldung per Single Sign-On" },
  "login.failed": { icon: "alert", label: "Fehlgeschlagener Anmeldeversuch" },
  logout: { icon: "logout", label: "Abgemeldet" },
  "file.delete": { icon: "trash", label: "In den Papierkorb verschoben" },
  "file.rename": { icon: "pencil", label: "Umbenannt" },
  "version.restore": { icon: "clock", label: "Ältere Version wiederhergestellt" },
  "trash.restore": { icon: "refresh", label: "Aus dem Papierkorb wiederhergestellt" },
  "trash.purge": { icon: "trash", label: "Endgültig gelöscht" },
  "trash.empty": { icon: "trash", label: "Papierkorb geleert" },
  "share.create": { icon: "share", label: "Freigabe-Link erstellt" },
  "share.revoke": { icon: "ban", label: "Freigabe-Link widerrufen" },
  "share.limit_reached": { icon: "ban", label: "Download-Limit eines Links erreicht" },
  "upload_link.create": { icon: "inbox", label: "Upload-Link erstellt" },
  "upload_link.revoke": { icon: "ban", label: "Upload-Link widerrufen" },
  "upload_link.upload": { icon: "inbox", label: "Datei über Upload-Link erhalten" },
  "webdav.password_regenerated": { icon: "lock", label: "Neues WebDAV-Passwort erzeugt" },
  "pin.regenerated": { icon: "lock", label: "Neuer Notfall-Code erzeugt" },
  "passkey.added": { icon: "lock", label: "Passkey hinzugefügt" },
  "admin.approve": { icon: "shield", label: "Konto freigeschaltet" },
  "admin.reject": { icon: "shield", label: "Konto abgelehnt" },
  "admin.quota": { icon: "shield", label: "Speicherlimit geändert" },
};

export function auditLabel(action: string) {
  return AUDIT_LABELS[action] ?? { icon: "activity" as IconName, label: action };
}
