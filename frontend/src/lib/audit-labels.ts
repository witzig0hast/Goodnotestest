// Human-readable labels for the audit log's action codes (see the
// backend's lib/audit.ts).
export const AUDIT_LABELS: Record<string, { icon: string; label: string }> = {
  "login.password": { icon: "🔑", label: "Anmeldung mit Passwort" },
  "login.passkey": { icon: "🔑", label: "Anmeldung mit Passkey" },
  "login.code": { icon: "🔑", label: "Anmeldung mit Notfall-Code" },
  "login.sso": { icon: "🔑", label: "Anmeldung per Single Sign-On" },
  "login.failed": { icon: "⚠️", label: "Fehlgeschlagener Anmeldeversuch" },
  logout: { icon: "↩", label: "Abgemeldet" },
  "file.delete": { icon: "🗑", label: "In den Papierkorb verschoben" },
  "file.rename": { icon: "✏️", label: "Umbenannt" },
  "version.restore": { icon: "🕓", label: "Ältere Version wiederhergestellt" },
  "trash.restore": { icon: "♻️", label: "Aus dem Papierkorb wiederhergestellt" },
  "trash.purge": { icon: "🗑", label: "Endgültig gelöscht" },
  "trash.empty": { icon: "🗑", label: "Papierkorb geleert" },
  "share.create": { icon: "📤", label: "Freigabe-Link erstellt" },
  "share.revoke": { icon: "🚫", label: "Freigabe-Link widerrufen" },
  "share.limit_reached": { icon: "⛔", label: "Download-Limit eines Links erreicht" },
  "upload_link.create": { icon: "📥", label: "Upload-Link erstellt" },
  "upload_link.revoke": { icon: "🚫", label: "Upload-Link widerrufen" },
  "upload_link.upload": { icon: "📥", label: "Datei über Upload-Link erhalten" },
  "webdav.password_regenerated": { icon: "🔐", label: "Neues WebDAV-Passwort erzeugt" },
  "pin.regenerated": { icon: "🔐", label: "Neuer Notfall-Code erzeugt" },
  "passkey.added": { icon: "🔐", label: "Passkey hinzugefügt" },
  "admin.approve": { icon: "👑", label: "Konto freigeschaltet" },
  "admin.reject": { icon: "👑", label: "Konto abgelehnt" },
  "admin.quota": { icon: "👑", label: "Speicherlimit geändert" },
};

export function auditLabel(action: string) {
  return AUDIT_LABELS[action] ?? { icon: "•", label: action };
}
