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
            GoodShare nimmt die automatische Sicherung aus GoodNotes entgegen
            und macht sie über eine einfache, passwortgeschützte Seite
            zugänglich – mit exakt derselben Ordnerstruktur wie in der App.
          </p>
          <div className={styles.actionRowInline}>
            <Link href="/erstellen" className={styles.button}>
              Neues Repository erstellen
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
                Repository erstellen und die Zugangsdaten notieren.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepText}>
                Diese Zugangsdaten einmalig in GoodNotes unter
                Einstellungen&nbsp;→&nbsp;Backup eintragen.
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepText}>
                GoodNotes sichert automatisch – hier kann jeder mit dem PIN
                die Notizen ansehen und herunterladen.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
