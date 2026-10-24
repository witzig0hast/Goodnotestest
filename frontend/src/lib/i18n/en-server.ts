// English versions of the backend's (German) error messages, looked up by
// exact text when an API error is shown — see translate() in ./index.ts.
export const enServer: Record<string, string> = {
  // Frontend fallbacks (lib/api.ts)
  "Etwas ist schiefgelaufen.": "Something went wrong.",
  "Die Datei ist zu groß.": "The file is too large.",
  "Hochladen ist fehlgeschlagen.": "Upload failed.",
  "Keine Verbindung zum Server.": "Can't reach the server.",

  // General
  "Ungültige Angaben.": "Invalid input.",
  "Ungültige Angabe.": "Invalid value.",
  "Fehlgeschlagen.": "Failed.",
  "Zu viele Versuche. Bitte warte eine Weile, bevor du es erneut versuchst.":
    "Too many attempts. Please wait a while before you try again.",

  // Sign-in and session
  "Nicht angemeldet.": "You're not signed in.",
  "Nur für Administratoren.": "Admins only.",
  "Bitte E-Mail und Passwort angeben.": "Please enter your email and password.",
  "E-Mail oder Passwort ist falsch.": "Wrong email or password.",
  "Bitte Repository-ID und Code angeben.": "Please enter your repository ID and code.",
  "Repository-ID oder Code ist falsch.": "Wrong repository ID or code.",
  "Falsches Passwort.": "Wrong password.",
  "Zugangsdaten sind falsch.": "Wrong credentials.",
  "Unbekannter Benutzer.": "Unknown user.",
  "Deine Anfrage wird noch bearbeitet. Um Überlastung zu vermeiden, muss ein neues Konto erst von einem Menschen geprüft werden, bevor du dich anmelden kannst.":
    "Your request is still being processed. To prevent overload, a person has to review new accounts before you can sign in.",
  "Dieses Konto wurde nicht freigeschaltet.": "This account hasn't been approved.",
  "Konto wartet noch auf Freigabe.": "This account is still waiting for approval.",

  // Passkeys
  "Diese Anfrage ist abgelaufen. Bitte nochmal versuchen.": "This request has expired. Please try again.",
  "Passkey konnte nicht bestätigt werden.": "Couldn't verify the passkey.",
  "Passkey konnte nicht eingerichtet werden.": "Couldn't set up the passkey.",
  "Dieser Passkey ist hier nicht registriert.": "This passkey isn't registered here.",
  "Zugehöriges Konto wurde nicht gefunden.": "The matching account wasn't found.",
  "Passkey-Anmeldung fehlgeschlagen.": "Passkey sign-in failed.",

  // SSO
  "SSO ist auf diesem Server nicht eingerichtet.": "SSO isn't set up on this server.",
  "Der Anmeldedienst ist gerade nicht erreichbar.": "The sign-in service can't be reached right now.",

  // Accounts
  "Bitte eine gültige E-Mail-Adresse angeben.": "Please enter a valid email address.",
  "Das Passwort muss mindestens 8 Zeichen haben.": "Your password needs at least 8 characters.",
  "Für diese E-Mail-Adresse gibt es bereits ein Konto.": "There's already an account for this email address.",
  "Konto nicht gefunden.": "Account not found.",
  "Repository nicht gefunden.": "Repository not found.",
  "Der Administrator kann sein Konto nicht selbst löschen, solange es keinen anderen Administrator gibt.":
    "The admin can't delete their own account while there's no other admin.",

  // Admin
  "Bitte ein Limit in MB angeben (oder leer lassen).": "Please enter a limit in MB (or leave it empty).",
  "Der Administrator kann nicht abgelehnt werden.": "The admin can't be rejected.",
  "Bitte einen Text angeben.": "Please enter some text.",
  "Nachricht nicht gefunden.": "Message not found.",

  // Files and folders
  "Kein Pfad angegeben.": "No path given.",
  "Ungültiger Pfad.": "Invalid path.",
  "Ungültiger Name.": "Invalid name.",
  "Nicht gefunden.": "Not found.",
  "Datei nicht gefunden.": "File not found.",
  "Ordner nicht gefunden.": "Folder not found.",
  "Keine Dateien ausgewählt.": "No files selected.",
  "Es gibt hier schon etwas mit diesem Namen.": "Something with this name already exists here.",
  "Bitte Pfad und neuen Namen angeben.": "Please give a path and a new name.",
  "Löschen ist fehlgeschlagen.": "Deleting failed.",
  "Umbenennen ist fehlgeschlagen.": "Renaming failed.",
  "Speicherlimit erreicht.": "Storage limit reached.",

  // Versions
  "Bitte Pfad und Version angeben.": "Please give a path and a version.",
  "Ungültige Version.": "Invalid version.",
  "Diese Version gibt es nicht.": "This version doesn't exist.",

  // Trash
  "Nicht im Papierkorb gefunden.": "Not found in the trash.",
  "Wiederherstellen ist fehlgeschlagen.": "Restoring failed.",
  "Endgültiges Löschen ist fehlgeschlagen.": "Deleting permanently failed.",

  // Tags
  "Bitte Name (max. 40 Zeichen) und Farbe angeben.": "Please give a name (max. 40 characters) and a color.",
  "Diesen Tag gibt es schon.": "This tag already exists.",
  "Tag nicht gefunden oder ungültig.": "Tag not found or invalid.",
  "Tag nicht gefunden.": "Tag not found.",

  // Share links
  "Ein Share-Link braucht mindestens eine Datei oder einen Ordner.": "A share link needs at least one file or folder.",
  "Link nicht gefunden.": "Link not found.",
  "Dieser Link ist ungültig oder abgelaufen.": "This link is invalid or has expired.",
  "Dieser Link wurde schon so oft abgerufen wie erlaubt.": "This link has already been used as many times as allowed.",
  "Bitte zuerst das Passwort eingeben.": "Please enter the password first.",
  "Datei oder Ordner nicht mehr vorhanden.": "The file or folder no longer exists.",

  // Upload links
  "Dieser Upload-Link ist ungültig oder abgelaufen.": "This upload link is invalid or has expired.",
  "Über diesen Link wurden schon alle erlaubten Dateien hochgeladen.":
    "All the files allowed for this link have already been uploaded.",
  "Keine Datei übertragen.": "No file was sent.",
  "Ungültiger Dateiname.": "Invalid file name.",
  "Der Speicherplatz der empfangenden Person ist voll.": "The recipient's storage is full.",
  "Der Zielordner existiert nicht mehr.": "The destination folder no longer exists.",

  // Nextcloud
  "Ungültiger Ordner.": "Invalid folder.",
  "Bitte URL, Benutzername und Passwort angeben.": "Please enter the URL, username and password.",
  "Verbindung fehlgeschlagen. Bitte URL, Benutzername und (App-)Passwort prüfen.":
    "Connection failed. Please check the URL, username and (app) password.",
  "Keine Nextcloud verbunden.": "No Nextcloud connected.",
  "Export zur Nextcloud ist fehlgeschlagen.": "Exporting to Nextcloud failed.",
  "Abruf von der Nextcloud ist fehlgeschlagen.": "Fetching from Nextcloud failed.",

  // Notifications
  "Bitte eine gültige Anzahl Tage angeben.": "Please enter a valid number of days.",
  "Der Betreiber dieses Servers hat noch keinen E-Mail-Versand eingerichtet.":
    "The operator of this server hasn't set up sending email yet.",
  "Testmail konnte nicht gesendet werden.": "Couldn't send the test email.",
  "SMTP ist auf diesem Server nicht eingerichtet.": "SMTP isn't set up on this server.",
};
