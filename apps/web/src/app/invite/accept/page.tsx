"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase-browser";
import { acceptInvite } from "../../../lib/api";

/**
 * ============================================================
 * /invite/accept — bestemming ná /auth/confirm
 * ============================================================
 *
 * Flow vanuit de uitnodigingsmail:
 *   1. Mail bevat link naar /auth/confirm?token_hash=…&type=invite
 *      &next=/invite/accept?inv=<ourToken>
 *   2. /auth/confirm verifieert de hash server-side en zet de
 *      Supabase-sessie in cookies. Daarna: redirect hierheen.
 *   3. Hier op de pagina is de sessie dus al aanwezig — we hoeven
 *      alleen nog onze eigen invite-token (`inv`) te valideren
 *      via POST /api/invites/accept.
 *
 * Foutafhandeling:
 *   - `auth_error` query-param (gezet door /auth/confirm) →
 *     specifieke melding over de e-maillink zelf (verlopen, al
 *     gebruikt, enz.). We doen dan geen accept-call.
 *   - Sessie ontbreekt onverwacht → "Open de link opnieuw".
 *   - Backend weigert de accept → toon de backend-melding
 *     (bijv. "invite voor ander e-mailadres", "invite verlopen").
 *
 * Na succes: actieve restaurant-id alvast in localStorage zetten
 * zodat de gebruiker direct in het juiste restaurant landt, dan
 * door naar /dashboard.
 */

// Sleutel die RestaurantContext gebruikt — zie restaurant-context.tsx.
// Door deze hier óók te zetten hoeft de gebruiker niet handmatig
// van restaurant te wisselen na accept.
const ACTIVE_RESTAURANT_STORAGE_KEY = "getfilly.activeRestaurantId";

type Status = "loading" | "accepting" | "success" | "auth-error" | "accept-error";

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const inviteToken = params.get("inv") ?? "";
  const authError = params.get("auth_error");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      // 1. Kwam de gebruiker hier met een auth_error uit /auth/confirm?
      //    Dan is de e-maillink zelf het probleem, niet onze invite-token.
      if (authError) {
        setStatus("auth-error");
        setMessage(mapAuthError(authError));
        return;
      }

      // 2. Geen invite-token in URL = verkeerde binnenkomst.
      if (!inviteToken) {
        setStatus("accept-error");
        setMessage("Geen uitnodigingstoken gevonden in de link.");
        return;
      }

      // 3. Sessie moet aanwezig zijn — /auth/confirm heeft 'm net
      //    gezet via cookies. Eén getSession-call volstaat; geen
      //    poll-loop nodig zoals voorheen.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("auth-error");
        setMessage(
          "Je bent niet ingelogd. Open de uitnodigingslink uit je e-mail opnieuw.",
        );
        return;
      }

      // 4. Invite accepteren via onze backend. Die controleert of
      //    de ingelogde e-mail matcht, koppelt de user aan het
      //    restaurant en retourneert restaurant-id + rol.
      setStatus("accepting");
      try {
        const { restaurantId } = await acceptInvite(inviteToken);

        // Nieuw gekoppeld restaurant alvast actief maken zodat
        // de gebruiker direct op dat restaurant landt.
        try {
          window.localStorage.setItem(
            ACTIVE_RESTAURANT_STORAGE_KEY,
            restaurantId,
          );
        } catch {
          // localStorage kan in privé-modus falen — geen blocker.
        }

        setStatus("success");
        setMessage("Welkom — je bent toegevoegd aan het team.");
        setTimeout(() => router.replace("/dashboard"), 1200);
      } catch (err) {
        setStatus("accept-error");
        setMessage(err instanceof Error ? err.message : String(err));
      }
    };

    void run();
  }, [inviteToken, authError, router]);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Uitnodiging</h1>

        {status === "loading" && <p style={mutedStyle}>Bezig met verifiëren…</p>}
        {status === "accepting" && (
          <p style={mutedStyle}>Uitnodiging verwerken…</p>
        )}

        {status === "success" && (
          <p style={{ color: "#16A34A", marginTop: 4 }}>{message}</p>
        )}

        {status === "auth-error" && (
          <>
            <p style={{ color: "#DC2626", marginTop: 4 }}>{message}</p>
            <p style={mutedStyle}>
              Vraag de beheerder van je restaurant om een nieuwe
              uitnodiging te sturen.
            </p>
            <a href="/login" style={linkBtnStyle}>
              Naar inloggen
            </a>
          </>
        )}

        {status === "accept-error" && (
          <>
            <p style={{ color: "#DC2626", marginTop: 4 }}>{message}</p>
            <a href="/dashboard" style={linkBtnStyle}>
              Terug naar dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// Vertaal de reden die /auth/confirm meegeeft naar een nette
// Nederlandse melding. Houdt UI vrij van cryptische codes.
function mapAuthError(reason: string): string {
  switch (reason) {
    case "expired":
      return "Deze uitnodigingslink is verlopen.";
    case "already_used":
      return "Deze uitnodigingslink is al eerder gebruikt.";
    case "missing_token":
      return "De link is incompleet — er ontbreekt een verificatiecode.";
    case "invalid_type":
      return "De link is niet geldig voor deze actie.";
    case "verify_failed":
    default:
      return "We konden de uitnodiging niet verifiëren.";
  }
}

// Suspense is verplicht wanneer we useSearchParams gebruiken op
// een pagina die ook server-rendered kan worden.
export default function InviteAcceptPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInner />
    </Suspense>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#FAFAFA",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 440,
  width: "100%",
  background: "#FFF",
  border: "1px solid #E4E4E7",
  borderRadius: 12,
  padding: "32px 28px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  textAlign: "center",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  margin: "0 0 16px",
  color: "#18181B",
};

const mutedStyle: React.CSSProperties = {
  color: "#52525B",
  fontSize: 14,
  marginTop: 4,
};

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 16,
  padding: "10px 18px",
  background: "#0F0F0F",
  color: "#FFF",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: 13,
};
