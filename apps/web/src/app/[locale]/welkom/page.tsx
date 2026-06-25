"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  PasswordStrength,
  isPasswordValid,
} from "@/components/password-strength";
import { authErrorKey } from "@/lib/auth-errors";

// ============================================================
// /welkom, activatie-stap voor een uitgenodigde nieuwe klant
// ============================================================
// Flow (invite-only, klant wordt aangemaakt via het CRM → onze API →
// Supabase inviteUserByEmail met redirectTo=/welkom):
//   1. Klant klikt de "Account activeren"-knop in de invite-mail.
//   2. /auth/confirm verifieert de invite-OTP en zet een geldige sessie
//      als cookie, en stuurt door naar hierheen (/welkom).
//   3. Hier kiest de klant zijn wachtwoord (updateUser). Een uitgenodigde
//      gebruiker heeft namelijk nog géén wachtwoord; zonder deze stap kan
//      'ie later niet met e-mail+wachtwoord inloggen.
//   4. Na succes → /dashboard → middleware ziet geen restaurant_users-rij
//      → stuurt automatisch door naar /onboarding (wizard).
//
// Géén geldige sessie (link verlopen/al gebruikt, of direct geopend):
// een uitgenodigde klant kan zélf geen nieuwe link aanvragen, dus
// verwijzen we naar info@get-filly.com i.p.v. naar /forgot-password.
// ============================================================

function WelkomForm() {
  const t = useTranslations("welkom");
  // Auth-foutmeldingen delen we met de login-flow (auth.errors.*) i.p.v. de
  // rauwe Engelse Supabase-tekst te tonen.
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();

  // Vertaal de auth_error-codes uit /auth/confirm (invite-specifiek).
  const translateInviteError = (code: string): string => {
    if (code === "expired") return t("errors.expired");
    if (code === "already_used") return t("errors.already_used");
    return t("errors.invalid");
  };

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Check of /auth/confirm een geldige sessie heeft gezet. Zonder sessie
  // kan je geen wachtwoord instellen → dan toont de pagina een nette
  // melding i.p.v. een formulier dat tóch zou falen.
  useEffect(() => {
    const authError = params.get("auth_error");
    if (authError) {
      setError(translateInviteError(authError));
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

    // Zelfde check als de checklist onder het veld, zo blijven UI en
    // validatie in sync (8+ tekens, letter, cijfer, speciaal teken).
    if (!isPasswordValid(password)) {
      setError(t("notAllReqs"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }

    // Oude stored restaurant-id wegflikkeren: een verse klant mag geen
    // X-Restaurant-Id van een vorige sessie meesturen (zou 403 geven).
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("getfilly.activeRestaurantId");
      } catch {
        // localStorage kan falen in privé-modus, negeer.
      }
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(tAuth(`errors.${authErrorKey(error)}`));
      return;
    }

    // Klaar. Naar /dashboard; de middleware ziet dat deze klant nog geen
    // restaurant heeft en stuurt 'm automatisch de onboarding-wizard in.
    router.push("/dashboard");
    router.refresh();
  };

  if (hasSession === null) {
    return <div className="login-sub">{t("loading")}</div>;
  }

  if (!hasSession) {
    return (
      <>
        <p className="login-sub">{error ?? t("invalidDefault")}</p>
        <div className="auth-switch" style={{ marginTop: 16 }}>
          {t("helpNeeded")}{" "}
          <a href="mailto:info@get-filly.com">info@get-filly.com</a>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="login-sub">{t("intro")}</p>

      <div className="form-group">
        <label className="form-label" htmlFor="welkom-password">{t("passwordLabel")}</label>
        <input
          id="welkom-password"
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
        <label className="form-label" htmlFor="welkom-confirm">{t("confirmLabel")}</label>
        <input
          id="welkom-confirm"
          className="form-input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
        />
        {/* Directe feedback bij een typo, vóór submit. */}
        {confirm.length > 0 && confirm !== password && (
          <div
            style={{
              fontSize: 12,
              color: "var(--red, #b00)",
              marginTop: 4,
            }}
          >
            {t("mismatch")}
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
        {loading ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

export default function WelkomPage() {
  const t = useTranslations("welkom");
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">{t("title")}</div>
        <Suspense fallback={<div className="login-sub">{t("loading")}</div>}>
          <WelkomForm />
        </Suspense>
      </div>
    </section>
  );
}
