"use client";

import Link from "next/link";
import { PageHeader } from "../components/PageHeader";
import { useT } from "../lib/i18n";
import styles from "./ui.module.css";
import { Icon, type IconName } from "../components/Icon";

const FEATURES = [
  {
    icon: "refresh" as IconName,
    title: "Automatisches Backup",
    text: "GoodNotes sichert sich selbst hierher — du musst nichts mehr exportieren.",
  },
  {
    icon: "pen" as IconName,
    title: "Sucht in deiner Handschrift",
    text: "Texterkennung macht auch Handgeschriebenes durchsuchbar — Treffer öffnen direkt auf der richtigen Seite.",
  },
  {
    icon: "share" as IconName,
    title: "Sicher teilen",
    text: "Links für einzelne Notizen oder ganze Ordner, auf Wunsch mit Passwort und Ablaufdatum.",
  },
  {
    icon: "clock" as IconName,
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
  const t = useT();
  return (
    <div className={styles.shellWide}>
      <PageHeader />
      <main className={styles.main} style={{ gap: 28 }}>
        <section className={styles.hero}>
          <div className={styles.heroBadge}><Icon name="pen" size={14} /> {t("Für GoodNotes-Nutzer")}</div>
          <h1 className={styles.heroTitle}>
            {t("Deine handschriftlichen Notizen,")}
            <br />
            <span className={styles.heroAccent}>{t("jederzeit griffbereit.")}</span>
          </h1>
          <p className={styles.heroSubtitle}>
            {t(
              "GoodShare nimmt die automatischen Backups von GoodNotes entgegen und zeigt sie dir auf einer einfachen, geschützten Seite — in genau der Ordnerstruktur wie in der App."
            )}
          </p>
          <div className={styles.heroActions}>
            <Link href="/erstellen" className={styles.button}>
              {t("Kostenlos loslegen →")}
            </Link>
            <Link href="/login" className={styles.buttonSecondary}>
              {t("Ich habe schon ein Konto")}
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
              <div className={styles.featureIcon}><Icon name={f.icon} size={20} /></div>
              <div className={styles.featureTitle}>{t(f.title)}</div>
              <div className={styles.featureText}>{t(f.text)}</div>
            </div>
          ))}
        </section>

        <section className={styles.card}>
          <div className={styles.eyebrow}>{t("In drei Schritten")}</div>
          <h2 className={styles.title} style={{ fontSize: 24 }}>
            {t("So funktioniert es")}
          </h2>
          <div className={styles.stepList}>
            {STEPS.map((step, i) => (
              <div key={step.title} className={styles.step}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <div className={styles.stepText}>
                  <strong>{t(step.title)}</strong>
                  <br />
                  <span style={{ color: "var(--muted)" }}>{t(step.text)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.actionRowInline} style={{ marginTop: 24 }}>
            <Link href="/erstellen" className={styles.button}>
              {t("Konto erstellen")}
            </Link>
          </div>
        </section>

        <p className={styles.footerNote}>
          {t("Deine Daten liegen auf diesem Server — nicht bei einem Dritten.")}
        </p>
      </main>
    </div>
  );
}
