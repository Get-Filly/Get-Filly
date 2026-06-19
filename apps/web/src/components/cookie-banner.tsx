"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// LocalStorage-sleutel voor de keuze van de bezoeker. Bewust geen
// cookie zelf, een cookie zou ironisch zijn voordat de gebruiker
// expliciet toestemt. localStorage valt buiten ePrivacy/AVG-cookie-
// regels (geldt alleen voor strikt-noodzakelijke storage zoals
// authenticatie).
const CONSENT_KEY = "filly-cookie-consent-v1";

type Consent = "accepted" | "rejected";

// Cookie-banner volgens NL/EU ePrivacy-regels:
//   - Verschijnt bij eerste bezoek (nog geen keuze in localStorage)
//   - Geeft expliciete keuze: accepteren OF weigeren
//   - "Weigeren" is even prominent als "accepteren" (geen dark-pattern)
//   - Geen analytics/tracking-scripts laden voordat consent gegeven
//
// Op dit moment doet Get-Filly nog geen analytics, banner staat klaar
// voor wanneer Plausible/PostHog wordt aangezet. Plaatsing-conditie:
// `process.env.NEXT_PUBLIC_HAS_ANALYTICS === 'true'` zodat we 'm
// zonder reden niet voor onze testers tonen.
export function CookieBanner() {
  const t = useTranslations("cookies");
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  useEffect(() => {
    // SSR-veilig: alleen lezen op de client.
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "rejected") {
      setConsent(stored);
    } else {
      setConsent(null);
    }
  }, []);

  const choose = (next: Consent) => {
    localStorage.setItem(CONSENT_KEY, next);
    setConsent(next);
    // Bij 'accepted': hier zou je dispatchEvent doen of analytics
    // initialiseren. Voor nu nog niets, klaar voor zodra Plausible
    // wordt toegevoegd.
  };

  // Eerste render: undefined = nog geen client-data, niets tonen
  // (voorkomt FOUC waar banner kort zichtbaar is voor returning users).
  // null = geen keuze in storage → banner tonen.
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label={t("aria")}
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 640,
        margin: "0 auto",
        padding: 20,
        background: "var(--white, #FFFFFF)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        zIndex: 1000,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ marginBottom: 12, color: "var(--text, #18181B)" }}>
        {t.rich("body", {
          link: (chunks) => (
            <Link
              href="/privacy"
              style={{ color: "var(--accent, #1F4A2D)", textDecoration: "underline" }}
            >
              {chunks}
            </Link>
          ),
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => choose("accepted")}
          style={{
            padding: "8px 18px",
            background: "var(--accent, #1F4A2D)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("accept")}
        </button>
        <button
          onClick={() => choose("rejected")}
          style={{
            padding: "8px 18px",
            background: "transparent",
            color: "var(--text, #18181B)",
            border: "1px solid var(--border, #E5DFD0)",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {t("necessary")}
        </button>
      </div>
    </div>
  );
}
