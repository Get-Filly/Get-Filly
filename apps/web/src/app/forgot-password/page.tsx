"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase-browser";

// ============================================================
// /forgot-password — stap 1 van password-reset
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
//     onbekend adres tonen we "we hebben een mail gestuurd" — zo
//     kan een aanvaller niet ontdekken welke adressen wel een account
//     hebben (user enumeration). Supabase handelt dit zelf netjes af
//     door geen fout te gooien op onbekende emails.
//
// Email-template in Supabase:
//   "Reset Password" moet wijzen naar:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
// ============================================================

export default function ForgotPasswordPage() {
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
        <div className="login-title">Wachtwoord resetten</div>

        {sent ? (
          <>
            <p className="login-sub">
              Als er een account bestaat met dit e-mailadres, hebben we je
              een reset-link gestuurd. Check je inbox (en spam).
            </p>
            <div className="auth-switch" style={{ marginTop: 16 }}>
              <Link href="/login">Terug naar inloggen</Link>
            </div>
          </>
        ) : (
          <>
            <p className="login-sub">
              Vul je e-mailadres in, dan sturen we je een link om een nieuw
              wachtwoord in te stellen.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">E-mailadres</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="naam@restaurant.nl"
                  required
                  autoFocus
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button className="login-btn" type="submit" disabled={loading}>
                {loading ? "Bezig…" : "Verstuur reset-link"}
              </button>

              <div className="auth-switch">
                Weet je het wachtwoord weer?{" "}
                <Link href="/login">Inloggen</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
