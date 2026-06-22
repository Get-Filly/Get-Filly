"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  PasswordStrength,
  isPasswordValid,
} from "@/components/password-strength";

// ============================================================
// /reset-password, stap 2 van password-reset
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
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();

  // Vertaal de auth_error-codes uit /auth/confirm naar begrijpelijke tekst.
  const translateAuthError = (code: string): string => {
    if (code === "expired") return t("reset.errors.expired");
    if (code === "already_used") return t("reset.errors.already_used");
    // missing_token / invalid_type / verify_failed / overige → generiek
    return t("reset.errors.invalid");
  };

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Check of er een geldige sessie is. Zonder sessie kan je geen
  // wachtwoord updaten, user is dan hier beland zonder via een
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

    // Dezelfde check als de checklist onder het veld, zo blijven UI
    // en validatie in sync. isPasswordValid controleert alle 4 eisen.
    if (!isPasswordValid(password)) {
      setError(t("reset.notAllReqs"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.mismatch"));
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

    // Succes, meteen naar dashboard. User is al ingelogd via de
    // recovery-sessie die Supabase heeft gezet.
    router.push("/dashboard");
    router.refresh();
  };

  if (hasSession === null) {
    return <div className="login-sub">{t("reset.loading")}</div>;
  }

  if (!hasSession) {
    return (
      <>
        <p className="login-sub">{error ?? t("reset.invalidDefault")}</p>
        <div className="auth-switch" style={{ marginTop: 16 }}>
          <Link href="/forgot-password">{t("reset.requestNew")}</Link>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="login-sub">{t("reset.intro")}</p>

      <div className="form-group">
        <label className="form-label" htmlFor="reset-new-password">{t("reset.newLabel")}</label>
        <input
          id="reset-new-password"
          className="form-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoFocus
        />
        <PasswordStrength password={password} />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reset-confirm-password">{t("reset.confirmLabel")}</label>
        <input
          id="reset-confirm-password"
          className="form-input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
        />
        {/* Directe feedback als de bevestiging afwijkt, zodat je niet
            pas na submit ontdekt dat je 'n typo had. */}
        {confirm.length > 0 && confirm !== password && (
          <div
            style={{
              fontSize: 12,
              color: "var(--red, #b00)",
              marginTop: 4,
            }}
          >
            {t("reset.mismatch")}
          </div>
        )}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button
        className="login-btn"
        type="submit"
        disabled={
          loading || !isPasswordValid(password) || password !== confirm
        }
      >
        {loading ? t("reset.submitting") : t("reset.submit")}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">{t("title")}</div>
        <Suspense fallback={<div className="login-sub">{t("loading")}</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </section>
  );
}
