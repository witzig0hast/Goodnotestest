// App shell: navigation, settings menu, dashboard frame, onboarding,
// activity/trash pages and shared small components.
export const enShell: Record<string, string> = {
  Einstellungen: "Settings",
  Verwaltung: "Administration",
  Abmelden: "Log out",
  "GoodNotes verbinden": "Connect GoodNotes",
  "Anmeldung & Sicherheit": "Sign-in & security",
  "Meine Freigaben": "My shares",
  Papierkorb: "Trash",
  "Aktivität & Backups": "Activity & backups",
  "Backup-Erinnerung": "Backup reminder",
  Nextcloud: "Nextcloud",
  "iOS-Kurzbefehl": "iOS Shortcut",
  "gerade eben": "just now",

  // Dashboard
  "Guten Morgen": "Good morning",
  Hallo: "Hello",
  "Guten Abend": "Good evening",
  "Notizen werden geladen …": "Loading notes …",
  "Wird geladen …": "Loading …",

  // Navigation & page shell
  "Meine Notizen": "My notes",
  Notizen: "Notes",
  "Kurze Einführung anzeigen": "Show a short intro",
  Hilfe: "Help",
  "Zurück zu meinen Notizen": "Back to my notes",

  // Getting started checklist
  "Erste Schritte": "Getting started",
  "{done} von {total} erledigt": "{done} of {total} done",
  Ausblenden: "Hide",
  "Konto erstellen": "Create an account",
  "Kurze Einführung ansehen (1 Minute)": "Watch the short intro (1 minute)",
  "GoodNotes verbinden und erstes Backup machen": "Connect GoodNotes and make your first backup",
  "Passkey einrichten — Anmelden per Face ID / Fingerabdruck":
    "Set up a Passkey — sign in with Face ID / fingerprint",
  "Eine Notiz per Link teilen (über „⋯“ → Teilen)": "Share a note via link (via “⋯” → Share)",

  // Welcome tour
  "Willkommen bei GoodShare": "Welcome to GoodShare",
  "GoodShare ist dein persönlicher Ablageplatz für GoodNotes-Backups. Einmal eingerichtet, landen deine Notizbücher automatisch hier — als PDF, in derselben Ordnerstruktur wie in der App.":
    "GoodShare is your personal home for GoodNotes backups. Once it's set up, your notebooks land here automatically — as PDFs, in the same folder structure as in the app.",
  "1. GoodNotes verbinden": "1. Connect GoodNotes",
  "In GoodNotes unter Einstellungen → Backup → WebDAV trägst du einmalig Adresse, Benutzername und Passwort ein. Die Angaben findest du jederzeit unter Einstellungen → „GoodNotes verbinden“.":
    "In GoodNotes, go to Settings → Backup → WebDAV and enter the address, username and password once. You can find these details any time under Settings → “Connect GoodNotes”.",
  "2. Notizen ansehen": "2. View your notes",
  "Tippe auf eine Notiz, um sie direkt im Browser anzusehen. Über das ⋯-Menü an jeder Zeile kannst du herunterladen, umbenennen, ältere Versionen wiederherstellen oder löschen.":
    "Tap a note to view it right in your browser. The ⋯ menu on each row lets you download, rename, restore older versions or delete.",
  "3. Finden statt suchen": "3. Find instead of search",
  "Die Suche findet nicht nur Dateinamen, sondern auch Text in deinen Notizen — sogar deine Handschrift wird im Hintergrund erkannt. Treffer öffnen direkt auf der richtigen Seite. Mit ☆ markierst du Favoriten, mit Tags sortierst du über Ordner hinweg.":
    "Search finds not just file names but also text inside your notes — even your handwriting is recognised in the background. Results open right on the matching page. Use ☆ to mark favourites, and tags to sort across folders.",
  "4. Teilen — sicher": "4. Share — safely",
  "Über „Teilen“ erzeugst du einen Link für eine Notiz, einen ganzen Ordner oder mehrere ausgewählte Einträge — auf Wunsch mit Passwort und Ablaufdatum. Alle Links verwaltest du unter „Meine Freigaben“.":
    "With “Share” you create a link for a note, a whole folder or several selected items — with a password and expiry date if you like. You manage all your links under “My shares”.",
  "Fast geschafft!": "Almost done!",
  "Tipp: Richte unter „Anmeldung & Sicherheit“ einen Passkey ein — dann meldest du dich künftig per Face ID oder Fingerabdruck an. Diese Einführung findest du jederzeit wieder oben unter „Hilfe“.":
    "Tip: set up a Passkey under “Sign-in & security” — then you can sign in with Face ID or your fingerprint from now on. You can find this intro again any time under “Help” at the top.",
  "Einführung · {step} von {total}": "Intro · {step} of {total}",
  "Schritt {n}": "Step {n}",
  Überspringen: "Skip",
  Zurück: "Back",
  "Los geht's": "Let's go",
  Weiter: "Next",

  // Backup calendar
  Mo: "Mon",
  Mi: "Wed",
  Fr: "Fri",
  So: "Sun",
  "Letztes Backup": "Last backup",
  "Tage mit Backup (½ Jahr)": "Days with a backup (½ year)",
  "{n} Tage": "{n} days",
  "{n} Tag": "{n} day",
  "Längste Lücke": "Longest gap",
  "kein Backup": "no backup",
  "{n} Datei gesichert": "{n} file backed up",
  "{n} Dateien gesichert": "{n} files backed up",
  weniger: "less",
  mehr: "more",
  "Noch keine Backups aufgezeichnet. Sobald GoodNotes Dateien schickt, füllt sich der Kalender.":
    "No backups recorded yet. As soon as GoodNotes sends files, the calendar fills up.",

  // Activity page & audit log
  Aktivität: "Activity",
  "Wann GoodNotes gesichert hat — und was in deinem Konto passiert ist.":
    "When GoodNotes backed up — and what happened in your account.",
  "Backup-Kalender": "Backup calendar",
  Protokoll: "Log",
  "Anmeldungen, Freigaben und Änderungen der letzten 6 Monate. Ein fehlgeschlagener Anmeldeversuch, den du nicht selbst warst? Dann ändere am besten dein Passwort.":
    "Sign-ins, shares and changes from the last 6 months. A failed sign-in attempt that wasn't you? Then it's best to change your password.",
  "Noch keine Einträge.": "No entries yet.",
  "Anmeldung mit Passwort": "Signed in with password",
  "Anmeldung mit Passkey": "Signed in with Passkey",
  "Anmeldung mit Notfall-Code": "Signed in with emergency code",
  "Anmeldung per Single Sign-On": "Signed in via single sign-on",
  "Fehlgeschlagener Anmeldeversuch": "Failed sign-in attempt",
  Abgemeldet: "Logged out",
  "In den Papierkorb verschoben": "Moved to trash",
  Umbenannt: "Renamed",
  "Ältere Version wiederhergestellt": "Older version restored",
  "Aus dem Papierkorb wiederhergestellt": "Restored from trash",
  "Endgültig gelöscht": "Permanently deleted",
  "Papierkorb geleert": "Trash emptied",
  "Freigabe-Link erstellt": "Share link created",
  "Freigabe-Link widerrufen": "Share link revoked",
  "Download-Limit eines Links erreicht": "A link's download limit was reached",
  "Upload-Link erstellt": "Upload link created",
  "Upload-Link widerrufen": "Upload link revoked",
  "Datei über Upload-Link erhalten": "File received via upload link",
  "Neues WebDAV-Passwort erzeugt": "New WebDAV password generated",
  "Neuer Notfall-Code erzeugt": "New emergency code generated",
  "Passkey hinzugefügt": "Passkey added",
  "Konto freigeschaltet": "Account approved",
  "Konto abgelehnt": "Account rejected",
  "Speicherlimit geändert": "Storage limit changed",

  // Upload links
  "Diesen Upload-Link widerrufen? Danach kann niemand mehr darüber hochladen.":
    "Revoke this upload link? Nobody will be able to upload through it anymore.",
  "Widerrufen ist fehlgeschlagen.": "Revoking failed.",
  "Noch keine Upload-Links. Erstelle einen über „⋯“ an einem Ordner → „Upload-Link erstellen“.":
    "No upload links yet. Create one via “⋯” on a folder → “Create upload link”.",
  "In „{folder}“": "Into “{folder}”",
  "{n} von {max} Datei erhalten": "{n} of {max} files received",
  "{n} von {max} Dateien erhalten": "{n} of {max} files received",
  "{n} Datei erhalten": "{n} file received",
  "{n} Dateien erhalten": "{n} files received",
  Passwortgeschützt: "Password-protected",
  Abgelaufen: "Expired",
  Voll: "Full",
  "gültig bis {date}": "valid until {date}",
  "unbegrenzt gültig": "valid indefinitely",
  Kopiert: "Copied",
  "Link kopieren": "Copy link",
  Widerrufen: "Revoke",

  // Trash
  "Der Papierkorb konnte nicht geladen werden.": "The trash couldn't be loaded.",
  "„{name}“ ist wieder da.": "“{name}” is back.",
  "„{name}“ ist wieder da — als „{newName}“, weil der Name inzwischen vergeben war.":
    "“{name}” is back — as “{newName}”, because the name was taken in the meantime.",
  "Wiederherstellen ist fehlgeschlagen.": "Restoring failed.",
  "„{name}“ endgültig löschen? Das lässt sich nicht rückgängig machen.":
    "Permanently delete “{name}”? This can't be undone.",
  "Löschen ist fehlgeschlagen.": "Deleting failed.",
  "Den ganzen Papierkorb endgültig leeren? Das lässt sich nicht rückgängig machen.":
    "Permanently empty the whole trash? This can't be undone.",
  "Leeren ist fehlgeschlagen.": "Emptying failed.",
  "Papierkorb leeren": "Empty trash",
  "Gelöschte Notizen und Ordner bleiben hier {n} Tage, bevor sie endgültig verschwinden — auch das, was du direkt in GoodNotes löschst.":
    "Deleted notes and folders stay here for {n} days before they're gone for good — including anything you delete directly in GoodNotes.",
  Anzeigen: "Show",
  "Der Papierkorb ist leer.": "The trash is empty.",
  "aus {folder}": "from {folder}",
  "in GoodNotes gelöscht am {date}": "deleted in GoodNotes on {date}",
  "hier gelöscht am {date}": "deleted here on {date}",
  "wird heute gelöscht": "will be deleted today",
  "noch {n} Tag": "{n} day left",
  "noch {n} Tage": "{n} days left",
  Wiederherstellen: "Restore",
  "Endgültig löschen": "Delete permanently",
};
