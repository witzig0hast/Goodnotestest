import Link from "next/link";
import { PageHeader } from "../components/PageHeader";
import styles from "./ui.module.css";

export default function LandingPage() {
  return (
    <div className={styles.shell}>
      <PageHeader />
      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Für GoodNotes-Nutzer</div>
          <h1 className={styles.title}>
            Deine handschriftlichen Notizen, jederzeit griffbereit
          </h1>
          <p className={styles.subtitle}>
            GoodNotes sichert sich automatisch hierhin. Du kannst deine
            Notizen dann jederzeit über eine einfache, geschützte Seite
            ansehen und herunterladen — in genau der Ordnerstruktur wie in
            der App.
          </p>
          <div className={styles.actionRowInline}>
            <Link href="/erstellen" className={styles.button}>
              Konto erstellen
            </Link>
            <Link href="/login" className={styles.buttonSecondary}>
              Ich habe schon eins
            </Link>
          </div>
        </section>

        <section className={styles.card}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
            So funktioniert es
          </h2>
          <div className={styles.stepList}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepText}>
                Konto mit E-Mail und Passwort anlegen (dauert eine Minute).
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepText}>
                Die angezeigten Zugangsdaten einmalig in GoodNotes unter
                Einstellungen&nbsp;→&nbsp;Backup eintragen.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepText}>
                Fertig. GoodNotes sichert ab jetzt automatisch — du kannst
                dich mit Passwort oder Passkey jederzeit einloggen und deine
                Notizen ansehen, herunterladen oder teilen.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
