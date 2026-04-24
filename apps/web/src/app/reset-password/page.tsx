"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase-browser";

// ============================================================
// /reset-password — stap 2 van password-reset
// ============================================================
// Flow:
//   User komt hier na klik op reset-link → /auth/confirm heeft de OTP
//   al geverifieerd en een geldige sessie gezet als cookie. Hier zet
//   de user zijn nieuwe wachtwoord via supabase.auth.updateUser().
//
// Als er GEEN geldige sessie is (user opent deze URL direct of link
// is verlopen), sturen we 'm terug naar /forgot-password met een
// nette melding. /auth/confirm geeft bij fouten ?auth_error=... mee.
// ============================================================

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Check of er een geldige sessie is. Zonder sessie kan je geen
  // wachtwoord updaten — user is dan hier beland zonder via een
  // geldige reset-link te komen.
  useEffect(() => {
    const authError = params.get("auth_error");
    if (authError) {
      setError(translateAuthError(authError));
      setHasSession(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Kies een wachtwoord van minstens 8 tekens.");
      return;
    }
    if (password !== confirm) {
      setError("De wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Succes — meteen naar dashboard. User is al ingelogd via de
    // recovery-sessie die Supabase heeft gezet.
    router.push("/dashboard");
    router.refresh();
  };

  if (hasSession === null) {
    return <div className="login-sub">Laden…</div>;
  }

  if (!hasSession) {
    return (
      <>
        <p className="login-sub">
          {error ??
            "Deze reset-link is niet meer geldig. Vraag een nieuwe link aan."}
        </p>
        <div className="auth-switch" style={{ marginTop: 16 }}>
          <Link href="/forgot-password">Nieuwe reset-link aanvragen</Link>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="login-sub">
        Kies een nieuw wachtwoord. Minimaal 8 tekens.
      </p>

      <div className="form-group">
        <label className="form-label">Nieuw wachtwoord</label>
        <input
          className="form-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoFocus
          minLength={8}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Bevestig wachtwoord</label>
        <input
          className="form-input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
        />
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button className="login-btn" type="submit" disabled={loading}>
        {loading ? "Bezig…" : "Stel wachtwoord in"}
      </button>
    </form>
  );
}

// Vertaal de auth_error-codes uit /auth/confirm naar begrijpelijke NL.
function translateAuthError(code: string): string {
  switch (code) {
    case "expired":
      return "De reset-link is verlopen. Vraag een nieuwe aan.";
    case "already_used":
      return "Deze reset-link is al gebruikt. Vraag een nieuwe aan als je opnieuw wil resetten.";
    case "missing_token":
    case "invalid_type":
    case "verify_failed":
    default:
      return "De reset-link is ongeldig. Vraag een nieuwe aan.";
  }
}

export default function ResetPasswordPage() {
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">Nieuw wachtwoord instellen</div>
        <Suspense fallback={<div className="login-sub">Laden…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </section>
  );
}
