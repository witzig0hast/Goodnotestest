// Settings and admin pages.
export const enSettings: Record<string, string> = {
  "← Zurück zu meinen Notizen": "← Back to my notes",
  "Speichern ist fehlgeschlagen.": "Saving failed.",
  Speichern: "Save",
  "Wird gespeichert …": "Saving …",
  Löschen: "Delete",

  // Admin
  "Konten konnten nicht geladen werden.": "Couldn't load the accounts.",
  "Nachricht konnte nicht erstellt werden.": "Couldn't create the message.",
  "Speicherlimit für „{name}“ in MB (leer lassen = {fallback}):":
    "Storage limit for “{name}” in MB (leave empty = {fallback}):",
  "Server-Standard, {size}": "server default, {size}",
  "kein Limit": "no limit",
  "Bitte eine ganze Zahl in MB angeben.": "Please enter a whole number of MB.",
  "Freischalten ist fehlgeschlagen.": "Approving failed.",
  "Dieses Konto ablehnen? Es kann sich dann nicht anmelden oder synchronisieren.":
    "Reject this account? It won't be able to sign in or sync.",
  "Ablehnen ist fehlgeschlagen.": "Rejecting failed.",
  "Neue Konten freischalten": "Approve new accounts",
  "Um Überlastung zu vermeiden, muss jedes neue Konto auf diesem Server erst von dir geprüft werden, bevor es sich anmelden oder mit GoodNotes synchronisieren kann.":
    "To avoid overload, you have to review every new account on this server before it can sign in or sync with GoodNotes.",
  "Aktuell wartet niemand auf Freischaltung.": "Nobody is waiting for approval right now.",
  "angefragt am {date}": "requested on {date}",
  Freischalten: "Approve",
  Ablehnen: "Reject",
  "Hinweise für alle Besucher": "Notices for all visitors",
  "Nachrichten hier erscheinen oben auf jeder Seite, auch für Leute, die noch nicht angemeldet sind — z. B. für eine angekündigte Wartung oder einen rechtlichen Hinweis. Jede Person kann eine Nachricht für sich ausblenden; sie verschwindet erst für alle, wenn du sie hier löschst.":
    "Messages here appear at the top of every page, even for people who aren't signed in — e.g. for planned maintenance or a legal notice. Everyone can hide a message for themselves; it only disappears for everyone once you delete it here.",
  "z. B. Am Samstag ist der Server kurz offline (Wartung).":
    "e.g. The server will be offline briefly on Saturday (maintenance).",
  Veröffentlichen: "Publish",
  "Aktuell ist keine Nachricht veröffentlicht.": "No message is published right now.",
  "seit {date}": "since {date}",
  "Alle Konten": "All accounts",
  "zuletzt gesichert {when}": "last backup {when}",
  "{size} belegt": "{size} used",
  "von {quota}": "of {quota}",
  "(Standard)": "(default)",
  Limit: "Limit",
  "Doch freischalten": "Approve after all",
  "Zugang entziehen": "Revoke access",
  "Protokoll aller Konten": "Activity log of all accounts",
  "Anmeldungen, fehlgeschlagene Versuche, Freigaben und Löschungen auf diesem Server — neueste zuerst.":
    "Sign-ins, failed attempts, shares and deletions on this server — newest first.",

  // Backup reminder
  "Wir schicken eine E-Mail an": "We'll send an email to",
  ", falls seit einer Weile kein neues GoodNotes-Backup mehr angekommen ist — praktisch, wenn WLAN oder Zugangsdaten mal kaputtgehen und du es sonst erst spät bemerkst.":
    " if no new GoodNotes backup has arrived for a while — handy when Wi-Fi or credentials break and you'd otherwise only notice much later.",
  "Aktiv — Erinnerung nach {n} Tagen ohne Backup": "Active — reminder after {n} days without a backup",
  "Testmail gesendet — schau in deinem Postfach nach.": "Test email sent — check your inbox.",
  "Erinnern nach wie vielen Tagen ohne neues Backup?": "Remind me after how many days without a new backup?",
  "Wird gesendet …": "Sending …",
  "Testmail senden": "Send test email",
  Deaktivieren: "Turn off",
  "Wöchentlicher Backup-Digest": "Weekly backup digest",
  "Einmal pro Woche einen Link per E-Mail an": "Once a week, email a link to",
  "schicken, mit dem du (oder wer auch immer den Link bekommt) alle Notizen als ZIP herunterladen kann — eine einfache zusätzliche Sicherung außerhalb von GoodShare.":
    "that lets you (or whoever gets the link) download all notes as a ZIP — a simple extra backup outside GoodShare.",
  "Digest deaktivieren": "Turn off digest",
  "Digest aktivieren": "Turn on digest",

  // My shares
  "Meine Notizen (alles)": "My notes (everything)",
  "{n} Objekte": "{n} items",
  "Freigaben konnten nicht geladen werden.": "Couldn't load your shares.",
  "Diesen Freigabe-Link wirklich widerrufen? Er funktioniert danach nicht mehr.":
    "Really revoke this share link? It will stop working.",
  "Alle Links, die du erstellt hast — mit Aufrufzähler und der Möglichkeit, sie jederzeit wieder zu widerrufen.":
    "All links you've created — with a view counter and the option to revoke them at any time.",
  "Du hast noch keine Freigabe-Links erstellt.": "You haven't created any share links yet.",
  "{used} von {max} Abrufen": "{used} of {max} downloads",
  "{n} Aufruf": "{n} view",
  "{n} Aufrufe": "{n} views",
  "Benachrichtigung an": "Notifications on",
  "Läuft ab am {date}": "Expires on {date}",
  "Läuft nie ab": "Never expires",
  "erstellt am {date}": "created on {date}",
  "Upload-Links": "Upload links",
  "Über diese Links können andere dir Dateien in einen Ordner schicken.":
    "With these links, others can send files into one of your folders.",

  // iOS Shortcut
  Anleitung: "Guide",
  "Einzelne Datei per iOS-Kurzbefehl teilen": "Share a single file via iOS Shortcut",
  "Mit diesem Kurzbefehl kannst du von überall auf dem iPhone/iPad (z. B. aus GoodNotes, den Dateien oder der Freigeben-Leiste) eine einzelne PDF direkt zu GoodShare schicken und bekommst sofort einen fertigen Freigabe-Link zurück — ganz ohne die Website zu öffnen. Ein fertiges Kurzbefehl-Paket lässt sich nicht automatisch erzeugen, aber der Kurzbefehl ist in 5 Minuten selbst gebaut.":
    "With this shortcut you can send a single PDF to GoodShare from anywhere on your iPhone/iPad (e.g. from GoodNotes, Files or the share sheet) and immediately get a ready-to-use share link back — without opening the website. A ready-made shortcut can't be generated automatically, but you can build it yourself in 5 minutes.",
  "Öffne die App": "Open the",
  Kurzbefehle: "Shortcuts",
  "auf dem iPhone/iPad und tippe oben rechts auf": "app on your iPhone/iPad and tap",
  ", um einen neuen Kurzbefehl anzulegen.": " in the top right to create a new shortcut.",
  "Tippe auf den Namen oben und benenne ihn z. B.": "Tap the name at the top and call it e.g.",
  "„Zu GoodShare teilen“": "“Share to GoodShare”",
  ". Aktiviere danach in den Einstellungen (Symbol „i“) die Option":
    ". Then, in its settings (the “i” icon), turn on",
  "„In Teilen-Menü anzeigen“": "“Show in Share Sheet”",
  "und wähle als akzeptierten Typ": "and choose as accepted type",
  "bzw.": "or",
  Dateien: "Files",
  "— dann taucht der Kurzbefehl in der iOS-Freigeben-Leiste auf.":
    "— the shortcut then shows up in the iOS share sheet.",
  "Füge die Aktion": "Add the action",
  "„Text“": "“Text”",
  "hinzu (optional, nur falls du den Dateinamen selbst festlegen willst) — für den Standardfall kannst du diesen Schritt überspringen.":
    "(optional, only if you want to set the file name yourself) — you can skip this step for the default case.",
  "„Inhalte von URL abrufen“": "“Get Contents of URL”",
  "(„Get Contents of URL“) hinzu und trage als Adresse ein:": "and enter as the address:",
  "Tippe bei dieser Aktion auf": "In this action, tap",
  "„Mehr anzeigen“": "“Show More”",
  "und stelle Folgendes ein:": "and set the following:",
  "Methode:": "Method:",
  "Kopfzeilen (Headers):": "Headers:",
  "Basic <Base64 von Benutzername:Passwort>": "Basic <Base64 of username:password>",
  "— am einfachsten mit der Kurzbefehl-Aktion": "— easiest with the shortcut action",
  "„Text kodieren“": "“Encode Text”",
  "(Base64) aus deinem WebDAV-Benutzernamen und -Passwort, getrennt durch einen Doppelpunkt, erzeugt.":
    "(Base64) from your WebDAV username and password, separated by a colon.",
  "Anfragetext (Request Body):": "Request Body:",
  "Datei (raw / file)": "File (raw / file)",
  "— wichtig: NICHT als JSON senden, sondern als reine Datei, sonst kommt die PDF beschädigt an. Wähle als Inhalt die":
    "— important: do NOT send it as JSON but as a plain file, otherwise the PDF arrives corrupted. As content, choose the",
  "Freigegebene Datei / Kurzbefehl-Eingabe": "Shared file / Shortcut Input",
  "Füge zuletzt": "Finally, add",
  "„Wert aus Wörterbuch abrufen“": "“Get Dictionary Value”",
  "mit dem Schlüssel": "with the key",
  "hinzu (angewandt auf das Ergebnis der vorigen Aktion), gefolgt von":
    "(applied to the result of the previous action), followed by",
  "„Text kopieren“": "“Copy to Clipboard”",
  "„Schnellansicht“": "“Quick Look”",
  ", damit du den fertigen Link sofort siehst bzw. in der Zwischenablage hast.":
    ", so you immediately see the finished link or have it in your clipboard.",
  "Nutze dafür genau die WebDAV-Zugangsdaten, die du auch in GoodNotes eingerichtet hast (Benutzername + Passwort von der Einrichtungsseite). Der Kurzbefehl legt die Datei automatisch im Ordner „Direkt geteilt“ ab und der Link läuft nach 30 Tagen ab.":
    "Use exactly the WebDAV credentials you set up in GoodNotes (username + password from the setup page). The shortcut automatically stores the file in the “Direkt geteilt” folder and the link expires after 30 days.",
  "Unbekanntes Gerät":
    "Unknown device",
  "{browser} auf {os}":
    "{browser} on {os}",
  "Alle anderen Geräte abmelden? Dort musst du dich danach neu anmelden.":
    "Sign out all other devices? You'll have to sign in again there.",
  "{n} Geräte abgemeldet.":
    "{n} devices signed out.",
  "Angemeldete Geräte":
    "Signed-in devices",
  "Hier bist du gerade angemeldet. Ein Gerät, das du nicht kennst? Melde es ab und ändere dein Passwort.":
    "You're currently signed in here. Don't recognise a device? Sign it out and change your password.",
  "Alle anderen abmelden":
    "Sign out all others",
  "Dieses Gerät":
    "This device",
  "zuletzt aktiv {when}":
    "last active {when}",
  "Bestätigungscode":
    "Verification code",
  "Zwei-Faktor-Anmeldung":
    "Two-factor sign-in",
  "Aktiv":
    "Active",
  "Zusätzlich zum Passwort fragt GoodShare nach einem 6-stelligen Code aus einer Authenticator-App (z. B. Google Authenticator, 1Password, Aegis). Anmelden per Passkey bleibt ohne Code möglich.":
    "In addition to your password, GoodShare asks for a 6-digit code from an authenticator app (e.g. Google Authenticator, 1Password, Aegis). Signing in with a passkey still works without a code.",
  "Zum Ausschalten den aktuellen Code eingeben:":
    "Enter the current code to turn it off:",
  "Zwei-Faktor-Anmeldung ausschalten":
    "Turn off two-factor sign-in",
  "QR-Code für die Authenticator-App":
    "QR code for the authenticator app",
  "Scanne den QR-Code mit deiner Authenticator-App.":
    "Scan the QR code with your authenticator app.",
  "Oder gib den Schlüssel von Hand ein:":
    "Or enter the key manually:",
  "Tippe den Code ein, den die App jetzt anzeigt:":
    "Type the code the app shows right now:",
  "Zwei-Faktor-Anmeldung einrichten":
    "Set up two-factor sign-in",
  "Gib den 6-stelligen Code aus deiner Authenticator-App ein.":
    "Enter the 6-digit code from your authenticator app.",
  "Kein Zugriff auf die App? Melde dich mit Konto-Kennung und Notfall-Code an und schalte die Zwei-Faktor-Anmeldung danach neu ein.":
    "No access to the app? Sign in with your account ID and emergency code, then set up two-factor sign-in again.",
};
