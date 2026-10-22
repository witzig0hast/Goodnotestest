"use client";

import { useEffect, useState } from "react";
import styles from "../app/ui.module.css";

export const OPEN_TOUR_EVENT = "goodshare:open-tour";
export const TOUR_CLOSED_EVENT = "goodshare:tour-closed";
const SEEN_KEY = "goodshare.tourSeen";

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private mode / blocked storage: better to not nag on every visit.
    return true;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // not fatal — the tour just might show again next time
  }
}

export function openTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}

const STEPS = [
  {
    art: "👋",
    title: "Willkommen bei GoodShare",
    text: "GoodShare ist dein persönlicher Ablageplatz für GoodNotes-Backups. Einmal eingerichtet, landen deine Notizbücher automatisch hier — als PDF, in derselben Ordnerstruktur wie in der App.",
  },
  {
    art: "🔗",
    title: "1. GoodNotes verbinden",
    text: "In GoodNotes unter Einstellungen → Backup → WebDAV trägst du einmalig Adresse, Benutzername und Passwort ein. Die Angaben findest du jederzeit unter Einstellungen → „GoodNotes verbinden“.",
  },
  {
    art: "📒",
    title: "2. Notizen ansehen",
    text: "Tippe auf eine Notiz, um sie direkt im Browser anzusehen. Über das ⋯-Menü an jeder Zeile kannst du herunterladen, umbenennen, ältere Versionen wiederherstellen oder löschen.",
  },
  {
    art: "🔎",
    title: "3. Finden statt suchen",
    text: "Die Suche durchsucht nicht nur Dateinamen, sondern auch den Text in deinen PDFs. Mit ☆ markierst du Favoriten, unter „Neu“ siehst du, was in den letzten 7 Tagen dazugekommen ist.",
  },
  {
    art: "📤",
    title: "4. Teilen — sicher",
    text: "Über „Teilen“ erzeugst du einen Link für eine Notiz, einen ganzen Ordner oder mehrere ausgewählte Einträge — auf Wunsch mit Passwort und Ablaufdatum. Alle Links verwaltest du unter „Meine Freigaben“.",
  },
  {
    art: "🔐",
    title: "Fast geschafft!",
    text: "Tipp: Richte unter „Anmeldung & Sicherheit“ einen Passkey ein — dann meldest du dich künftig per Face ID oder Fingerabdruck an. Diese Einführung findest du jederzeit wieder oben unter „Hilfe“.",
  },
];

export function WelcomeTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function close() {
    markTourSeen();
    window.dispatchEvent(new Event(TOUR_CLOSED_EVENT));
    onClose();
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.modalOverlay} onClick={close}>
      <div
        className={styles.tourBox}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        <div className={styles.tourArt}>
          <span key={step}>{current.art}</span>
        </div>
        <div className={styles.tourBody}>
          <div className={styles.tourStepLabel}>
            Einführung · {step + 1} von {STEPS.length}
          </div>
          <h2 id="tour-title" className={styles.tourTitle}>
            {current.title}
          </h2>
          <p className={styles.tourText}>{current.text}</p>
        </div>
        <div className={styles.tourFooter}>
          <div className={styles.tourDots}>
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={i === step ? styles.tourDotActive : styles.tourDot}
                onClick={() => setStep(i)}
                aria-label={`Schritt ${i + 1}`}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step === 0 ? (
              <button type="button" className={styles.smallButton} onClick={close}>
                Überspringen
              </button>
            ) : (
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => setStep(step - 1)}
              >
                Zurück
              </button>
            )}
            <button
              type="button"
              className={styles.button}
              style={{ padding: "8px 16px", fontSize: 14 }}
              onClick={() => (isLast ? close() : setStep(step + 1))}
              autoFocus
            >
              {isLast ? "Los geht's" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
