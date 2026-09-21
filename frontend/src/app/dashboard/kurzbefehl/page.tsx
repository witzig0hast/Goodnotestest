"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import styles from "../../ui.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function KurzbefehlPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error();
        setChecking(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (checking) {
    return (
      <div className={styles.shell}>
        <PageHeader />
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.hint}>Wird geladen …</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Anleitung</div>
          <h1 className={styles.title}>Einzelne Datei per iOS-Kurzbefehl teilen</h1>
          <p className={styles.subtitle}>
            Mit diesem Kurzbefehl kannst du von überall auf dem iPhone/iPad
            (z. B. aus GoodNotes, den Dateien oder der Freigeben-Leiste) eine
            einzelne PDF direkt zu GoodShare schicken und bekommst sofort
            einen fertigen Freigabe-Link zurück — ganz ohne die Website zu
            öffnen. Ein fertiges Kurzbefehl-Paket lässt sich nicht automatisch
            erzeugen, aber der Kurzbefehl ist in 5 Minuten selbst gebaut.
          </p>

          <div className={styles.stepList}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepText}>
                Öffne die App <strong>Kurzbefehle</strong> auf dem iPhone/iPad
                und tippe oben rechts auf <strong>+</strong>, um einen neuen
                Kurzbefehl anzulegen.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepText}>
                Tippe auf den Namen oben und benenne ihn z. B.{" "}
                <strong>„Zu GoodShare teilen“</strong>. Aktiviere danach in den
                Einstellungen (Symbol „i“) die Option{" "}
                <strong>„In Teilen-Menü anzeigen“</strong> und wähle als
                akzeptierten Typ <strong>PDF</strong> bzw. <strong>Dateien</strong> —
                dann taucht der Kurzbefehl in der iOS-Freigeben-Leiste auf.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepText}>
                Füge die Aktion <strong>„Text“</strong> hinzu (optional, nur
                falls du den Dateinamen selbst festlegen willst) — für den
                Standardfall kannst du diesen Schritt überspringen.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepText}>
                Füge die Aktion <strong>„Inhalte von URL abrufen“</strong>{" "}
                („Get Contents of URL“) hinzu und trage als Adresse ein:
                <div
                  className={styles.secretValue}
                  style={{ marginTop: 8, marginBottom: 8 }}
                >
                  <span>{API_BASE_URL}/api/shortcuts/quick-share</span>
                </div>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>5</div>
              <div className={styles.stepText}>
                Tippe bei dieser Aktion auf <strong>„Mehr anzeigen“</strong> und
                stelle Folgendes ein:
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  <li>Methode: <strong>POST</strong></li>
                  <li>
                    Kopfzeilen (Headers): <strong>Authorization</strong> ={" "}
                    <code>Basic &lt;Base64 von Benutzername:Passwort&gt;</code>{" "}
                    — am einfachsten mit der Kurzbefehl-Aktion{" "}
                    <strong>„Text kodieren“</strong> (Base64) aus deinem
                    WebDAV-Benutzernamen und -Passwort, getrennt durch einen
                    Doppelpunkt, erzeugt.
                  </li>
                  <li>
                    Anfragetext (Request Body):{" "}
                    <strong>Datei (raw / file)</strong> — wichtig: NICHT als
                    JSON senden, sondern als reine Datei, sonst kommt die PDF
                    beschädigt an. Wähle als Inhalt die{" "}
                    <strong>Freigegebene Datei / Kurzbefehl-Eingabe</strong>.
                  </li>
                </ul>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>6</div>
              <div className={styles.stepText}>
                Füge zuletzt <strong>„Wert aus Wörterbuch abrufen“</strong> mit
                dem Schlüssel <code>url</code> hinzu (angewandt auf das
                Ergebnis der vorigen Aktion), gefolgt von{" "}
                <strong>„Text kopieren“</strong> oder{" "}
                <strong>„Schnellansicht“</strong>, damit du den fertigen Link
                sofort siehst bzw. in der Zwischenablage hast.
              </div>
            </div>
          </div>

          <div className={styles.warningBox} style={{ marginTop: 20 }}>
            Nutze dafür genau die WebDAV-Zugangsdaten, die du auch in GoodNotes
            eingerichtet hast (Benutzername + Passwort von der
            Einrichtungsseite). Der Kurzbefehl legt die Datei automatisch im
            Ordner „Direkt geteilt“ ab und der Link läuft nach 30 Tagen ab.
          </div>
        </section>

        <section className={styles.card}>
          <Link href="/dashboard" className={styles.buttonSecondary}>
            Zurück zu meinen Notizen
          </Link>
        </section>
      </main>
    </div>
  );
}
