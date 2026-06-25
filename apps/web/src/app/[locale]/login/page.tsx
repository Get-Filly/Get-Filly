"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase-browser";
import { authErrorKey } from "@/lib/auth-errors";

// Open-redirect-bescherming: alleen interne, absolute paden toestaan.
// Een aanvaller kan ?next=https://phishing.nl of ?next=//evil.nl in de
// URL zetten; zonder deze check zou de gebruiker daar na login heen gaan.
// Spiegelt de parseSafeNext-logica van /auth/confirm, maar client-side
// path-only (we hebben hier geen server-origin nodig).
function safeNextPath(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\")
  ) {
    return raw;
  }
  return "/dashboard";
}

function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Geen rauwe Engelse Supabase-tekst tonen; map naar NL/EN-microcopy.
      setError(t(`errors.${authErrorKey(error)}`));
      setLoading(false);
      return;
    }

    // Clear de stored restaurant-id voordat we doorgaan. Een user die
    // eerder op deze browser was ingelogd kan een ander restaurant
    // actief hebben gehad dat voor deze user niet toegankelijk is;
    // RestaurantContext kiest straks de juiste uit /me/restaurants.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("getfilly.activeRestaurantId");
      } catch {
        // localStorage kan falen in privé-modus, negeer.
      }
    }

    router.push(nextPath);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="login-email">{t("fields.email")}</label>
        <input
          id="login-email"
          className="form-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("fields.emailPlaceholder")}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="login-password">{t("fields.password")}</label>
        <input
          id="login-password"
          className="form-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
        <Link className="forgot-link" href="/forgot-password">
          {t("login.forgot")}
        </Link>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button className="login-btn" type="submit" disabled={loading}>
        {loading ? t("login.submitting") : t("login.submit")}
      </button>

      {/* Self-service registratie is uitgeschakeld (invite-only): nieuwe
          accounts maakt Get-Filly zelf aan in Supabase. In plaats van
          "account aanmaken" triggeren we bezoekers met een demo-aanvraag,
          die naar dezelfde /contact-pagina leidt als de CTA's op de landing. */}
      <div className="auth-switch">
        {t("login.noAccount")}{" "}
        <Link href="/contact">{t("login.requestDemo")}</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth.login");
  return (
    <section className="login-section">
      <div className="login-box">
        <div className="login-title">{t("title")}</div>
        <p className="login-sub">{t("subtitle")}</p>
        <Suspense fallback={<div>{t("loading")}</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}
