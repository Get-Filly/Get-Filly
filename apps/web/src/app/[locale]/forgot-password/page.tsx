"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase-browser";

// ============================================================
// /forgot-password, stap 1 van password-reset
// ============================================================
// Flow:
//   1. User typt email → klik "Verstuur reset-link"
//   2. We roepen supabase.auth.resetPasswordForEmail() aan met
//      redirectTo = ons eigen /auth/confirm (via de email-template).
//   3. Supabase stuurt een mail met een 'recovery' OTP-link.
//   4. User klikt link → /auth/confirm verifieert → redirect naar
//      /reset-password (met geldige sessie) → nieuw wachtwoord zetten.
//
// Security-noot:
//   - We laten NIET weten of het email-adres bestaat. Ook bij een
//     onbekend adres tonen we "we hebben een mail gestuurd", zo
//     kan een aanvaller niet ontdekken welke adressen wel een account
//     hebben (user enumeration). Supabase handelt dit zelf netjes af
//     door geen fout te gooien op onbekende emails.
//
// Email-template in Supabase:
//   "Reset Password" moet wijzen naar:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
// ============================================================

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    // redirectTo wordt door Supabase als {{ .RedirectTo }} in de email-
    // template geplakt; ons /auth/confirm neemt dat mee als `next`.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      // Echte fouten zoals rate-limit tonen we wel (niet user-specifiek).
      setError(error.message);
      return;
    }

    // Ook bij onbekend email: toon success-state zodat een aanvaller
    // niet kan enumereren welke emails wel/niet bestaan.
    setSent(true);
  };

  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">{t("forgot.title")}</div>

        {sent ? (
          <>
            <p className="login-sub">{t("forgot.sentText")}</p>
            <div className="auth-switch" style={{ marginTop: 16 }}>
              <Link href="/login">{t("forgot.backToLogin")}</Link>
            </div>
          </>
        ) : (
          <>
            <p className="login-sub">{t("forgot.intro")}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="forgot-email">{t("fields.email")}</label>
                <input
                  id="forgot-email"
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("fields.emailPlaceholder")}
                  required
                  autoFocus
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? t("forgot.submitting") : t("forgot.submit")}
              </button>

              <div className="auth-switch">
                {t("forgot.rememberQ")}{" "}
                <Link href="/login">{t("forgot.login")}</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
