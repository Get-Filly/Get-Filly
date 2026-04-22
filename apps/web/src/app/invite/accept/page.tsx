"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase-browser";
import { acceptInvite } from "../../../lib/api";

/**
 * ============================================================
 * /invite/accept — eindpunt van een invite-mail
 * ============================================================
 *
 * Flow:
 *   1. User klikt op link in uitnodigingsmail.
 *   2. Supabase's magic-link logt ze automatisch in (zet session-cookie).
 *   3. Deze pagina leest "inv" uit query-string → dat is onze token.
 *   4. Wacht tot Supabase de session heeft geladen (korte moment).
 *   5. Roept POST /api/invites/accept aan.
 *   6. Bij success: redirect naar /dashboard — de nieuwe koppeling is actief.
 *   7. Bij fout: nette boodschap tonen + logout-knop (voor als ze
 *      bij verkeerde account zijn binnengekomen).
 */

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("inv") ?? "";

  const [status, setStatus] = useState<
    "loading" | "accepting" | "success" | "error" | "no-session"
  >("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Geen token in de link gevonden.");
        return;
      }

      const supabase = createClient();

      // Wacht kort op sessie — Supabase magic-link zet de cookie
      // direct bij terugkomst op de URL, maar kan een tick duren.
      let session = null;
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      if (!session) {
        setStatus("no-session");
        setMessage(
          "Je bent niet ingelogd. Open de link uit je e-mail opnieuw, of log eerst in via /login.",
        );
        return;
      }

      setStatus("accepting");
      try {
        await acceptInvite(token);
        setStatus("success");
        setMessage("Welkom — je bent toegevoegd aan het team.");
        // Korte pauze zodat gebruiker de melding ziet, dan door.
        setTimeout(() => {
          router.replace("/dashboard");
        }, 1500);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : String(err));
      }
    };

    void run();
  }, [token, router]);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Uitnodiging</h1>
        {status === "loading" && <p>Sessie ophalen…</p>}
        {status === "accepting" && <p>Uitnodiging verwerken…</p>}
        {status === "success" && (
          <p style={{ color: "#16A34A" }}>{message}</p>
        )}
        {status === "no-session" && (
          <>
            <p>{message}</p>
            <a href="/login" style={linkBtnStyle}>
              Naar inloggen
            </a>
          </>
        )}
        {status === "error" && (
          <>
            <p style={{ color: "#DC2626" }}>{message}</p>
            <a href="/dashboard" style={linkBtnStyle}>
              Terug naar dashboard
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// Suspense is verplicht wanneer we useSearchParams gebruiken op een
// pagina die ook server-rendered kan worden.
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

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 12,
  padding: "10px 18px",
  background: "#0F0F0F",
  color: "#FFF",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: 13,
};
