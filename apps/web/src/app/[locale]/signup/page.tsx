"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// ============================================================
// /signup, invite-only uitlegpagina
// ============================================================
// Self-service registratie is uitgeschakeld sinds 2026-06-02: nieuwe
// accounts maakt Get-Filly zelf aan (invite-only via Supabase), zodat
// concurrenten zich niet zelf kunnen registreren. De ECHTE blokkade zit
// in Supabase ("Allow new users to sign up" = uit) — dat dicht ook de
// directe API-route met de anon-key.
//
// Vroeger deed deze route een stille redirect naar /contact. Dat was
// verwarrend: wie /signup intikt (of een oude link volgt) belandde
// zonder uitleg op een ander formulier. Nu tonen we een korte uitleg +
// directe CTA naar de demo-aanvraag, in dezelfde auth-stijl als /login.
export default function SignupPage() {
  const t = useTranslations("auth");
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">{t("signup.title")}</div>
        <p className="login-sub">{t("signup.intro")}</p>

        <Link className="login-btn" href="/contact">
          {t("signup.requestDemo")}
        </Link>

        <div className="auth-switch">
          {t("signup.haveAccount")}{" "}
          <Link href="/login">{t("signup.login")}</Link>
        </div>
      </div>
    </section>
  );
}
