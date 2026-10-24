import Link from "next/link";
import { PageHeader } from "../components/PageHeader";
import styles from "./ui.module.css";

const FEATURES = [
  {
    icon: "🔄",
    title: "Automatisches Backup",
    text: "GoodNotes sichert sich selbst hierher — du musst nichts mehr exportieren.",
  },
  {
    icon: "🔎",
    title: "Sucht in deiner Handschrift",
    text: "Texterkennung macht auch Handgeschriebenes durchsuchbar — Treffer öffnen direkt auf der richtigen Seite.",
  },
  {
    icon: "📤",
    title: "Sicher teilen",
    text: "Links für einzelne Notizen oder ganze Ordner, auf Wunsch mit Passwort und Ablaufdatum.",
  },
  {
    icon: "🕓",
    title: "Versionsverlauf",
    text: "Versehentlich überschrieben? Ältere Fassungen lassen sich wiederherstellen.",
  },
];

const STEPS = [
  {
    title: "Konto anlegen",
    text: "Mit E-Mail und Passwort — dauert eine Minute.",
  },
  {
    title: "GoodNotes verbinden",
    text: "Die angezeigten Zugangsdaten einmalig in GoodNotes unter Einstellungen → Backup → WebDAV eintragen.",
  },
  {
    title: "Fertig",
    text: "Ab jetzt landet jedes Backup automatisch hier. Ansehen, herunterladen und teilen — vom Handy, Tablet oder PC.",
  },
];

export default function LandingPage() {
  return (
    <div className={styles.shellWide}>
      <PageHeader />
      <main className={styles.main} style={{ gap: 28 }}>
        <section className={styles.hero}>
          <div className={styles.heroBadge}>✍️ Für GoodNotes-Nutzer</div>
          <h1 className={styles.heroTitle}>
            Deine handschriftlichen Notizen,
            <br />
            <span className={styles.heroAccent}>jederzeit griffbereit.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            GoodShare nimmt die automatischen Backups von GoodNotes entgegen und
            zeigt sie dir auf einer einfachen, geschützten Seite — in genau der
            Ordnerstruktur wie in der App.
          </p>
          <div className={styles.heroActions}>
            <Link href="/erstellen" className={styles.button}>
              Kostenlos loslegen →
            </Link>
            <Link href="/login" className={styles.buttonSecondary}>
              Ich habe schon ein Konto
            </Link>
          </div>
        </section>

        <section className={styles.featureGrid}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={styles.featureCard}
              style={{ animationDelay: `${0.08 + i * 0.05}s` }}
            >
              <div className={styles.featureIcon}>{f.icon}</div>
              <div className={styles.featureTitle}>{f.title}</div>
              <div className={styles.featureText}>{f.text}</div>
            </div>
          ))}
        </section>

        <section className={styles.card}>
          <div className={styles.eyebrow}>In drei Schritten</div>
          <h2 className={styles.title} style={{ fontSize: 24 }}>
            So funktioniert es
          </h2>
          <div className={styles.stepList}>
            {STEPS.map((step, i) => (
              <div key={step.title} className={styles.step}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <div className={styles.stepText}>
                  <strong>{step.title}</strong>
                  <br />
                  <span style={{ color: "var(--muted)" }}>{step.text}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.actionRowInline} style={{ marginTop: 24 }}>
            <Link href="/erstellen" className={styles.button}>
              Konto erstellen
            </Link>
          </div>
        </section>

        <p className={styles.footerNote}>
          Deine Daten liegen auf diesem Server — nicht bei einem Dritten.
        </p>
      </main>
    </div>
  );
}
