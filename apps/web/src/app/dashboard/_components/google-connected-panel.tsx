"use client";

// ============================================================
// GoogleConnectedPanel, zichtbaar bewijs dat business.manage werkt
// ============================================================
// Verschijnt onder de koppelingen-lijst zodra Google gekoppeld is. Haalt
// via accounts.list de beheerde Bedrijfsprofielen op en toont ze. Dit is
// precies wat Google in de verificatievideo wil zien: de app gebruikt de
// gevraagde scope écht.
//
// Vóór de Business Profile API-goedkeuring (quotum 0) geeft Google 403;
// dat tonen we als een nette "toegang in aanvraag"-melding i.p.v. een
// fout. Self-gating: niet gekoppeld / flag uit -> rendert niets.

import { useEffect, useState } from "react";

import { useRestaurant } from "@/lib/restaurant-context";
import {
  googleBusinessStatus,
  googleBusinessProfile,
  type GoogleBusinessAccount,
} from "@/lib/api";

const GOOGLE_OAUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

export function GoogleConnectedPanel() {
  const { active } = useRestaurant();

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<GoogleBusinessAccount[]>([]);
  const [notApproved, setNotApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_OAUTH_ENABLED) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await googleBusinessStatus();
        if (cancelled) return;
        setConnected(status.connected);
        if (status.connected) {
          try {
            const { accounts } = await googleBusinessProfile();
            if (!cancelled) setAccounts(accounts);
          } catch (e) {
            if (cancelled) return;
            const reason = e instanceof Error ? e.message : "";
            // De backend geeft 'api_not_approved' tot Google de
            // API-toegang goedkeurt; dat is geen echte fout.
            if (reason === "api_not_approved") setNotApproved(true);
            else setError("Profielgegevens ophalen mislukt.");
          }
        }
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Flag uit, nog ladend, of niet gekoppeld -> niets tonen.
  if (!GOOGLE_OAUTH_ENABLED || loading || !connected) return null;

  return (
    <div
      style={{
        marginTop: "var(--space-5)",
        padding: 16,
        background: "var(--white, #FFFFFF)",
        border: "1px solid var(--border, #E5DFD0)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        Google Bedrijfsprofiel
      </div>

      {notApproved ? (
        <div style={{ fontSize: 12, color: "var(--tl)", lineHeight: 1.5 }}>
          ✓ Verbonden. Het ophalen en beheren van je profielgegevens komt
          beschikbaar zodra Google de API-toegang heeft goedgekeurd (in
          aanvraag).
        </div>
      ) : error ? (
        <div style={{ fontSize: 12, color: "var(--red, #B42318)" }}>{error}</div>
      ) : accounts.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--tl)" }}>
          Geen beheerde Google-Bedrijfsprofielen gevonden onder dit account.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "var(--tl)", marginBottom: 8 }}>
            Beheerde profielen via je Google-account:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {accounts.map((a) => (
              <li key={a.name}>
                {a.accountName}
                {a.type ? ` (${a.type})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
