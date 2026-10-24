import Link from "next/link";
import { AppNav } from "./AppNav";
import { LanguageSwitch } from "./LanguageSwitch";
import styles from "../app/ui.module.css";

// `app` switches to the logged-in variant: the logo leads back to the
// notes instead of the landing page, and the main navigation sits on the
// right — so every page behind the login has the same way back and to the
// settings, instead of each page rolling its own "back" card.
export function PageHeader({ app = false }: { app?: boolean }) {
  return (
    <header className={styles.header}>
      <Link href={app ? "/dashboard" : "/"} className={styles.logo}>
        <div className={styles.logoMark}>G</div>
        <div className={styles.logoText}>GoodShare</div>
      </Link>
      {app ? <AppNav /> : <LanguageSwitch />}
    </header>
  );
}
