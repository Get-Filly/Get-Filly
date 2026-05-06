"use client";

import { useEffect, useState } from "react";
import {
  setCampaignSchedule,
  suggestCampaignSchedule,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";

// ============================================================
// CampaignSchedulePanel, Filly stelt verzendmoment voor + accept/edit
// ============================================================
// Inline card op /campagnes/[id] (concept of ingepland). Drie states:
//   - Geen scheduled_for + geen suggested → bootstrap (auto-trigger
//     suggestSchedule, cachet in DB).
//   - Suggested aanwezig, scheduled niet bevestigd → toon voorstel
//     met reasoning, "Accepteer" / "Wijzig zelf"-knoppen.
//   - Scheduled bevestigd → toon definitieve tijd + "Wijzig"-link.
//
// User kan altijd handmatig overschrijven via een datetime-input
// (native browser-control). Bij wijziging blijft het Filly-voorstel
// in de DB als referentie.
//
// "↻ Vraag Filly opnieuw" triggert force=true → nieuwe Claude-call.
// Voor kostenbeheersing geen rate-limit op count, want eigenaar
// initieert dit bewust.

function formatDutchDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Voor input type=datetime-local: "YYYY-MM-DDTHH:MM" in lokale tijd.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  // Strip seconden + timezone-suffix; datetime-local verwacht naive.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignSchedulePanel({
  campaignId,
  status,
  scheduledFor,
  suggestedFor,
  suggestedReasoning,
  onChanged,
}: {
  campaignId: string;
  status: string;
  scheduledFor: string | null;
  suggestedFor: string | null;
  suggestedReasoning: string | null;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftDatetime, setDraftDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Bij eerste mount zonder voorstel/scheduled: vraag Filly automatisch
  // een voorstel te doen. Cachet in DB zodat refresh geen nieuwe
  // Claude-call triggert. Alleen als status het toelaat (concept).
  useEffect(() => {
    if (status !== "concept") return;
    if (suggestedFor) return;
    if (scheduledFor) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await suggestCampaignSchedule(campaignId, false);
        if (!cancelled) onChanged();
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Kon geen voorstel maken. Probeer het later opnieuw.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We willen alleen 1× triggeren bij mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const accept = async () => {
    if (!suggestedFor || loading) return;
    setError(null);
    setLoading(true);
    try {
      await setCampaignSchedule(campaignId, suggestedFor);
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Accepteren mislukt. Probeer opnieuw.",
      );
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    setDraftDatetime(
      toDatetimeLocalValue(scheduledFor ?? suggestedFor ?? new Date().toISOString()),
    );
    setEditing(true);
    setError(null);
  };

  const saveEdit = async () => {
    if (!draftDatetime || loading) return;
    setError(null);
    setLoading(true);
    try {
      // datetime-local geeft een naive string; we maken er een
      // ISO-datum van in de lokale timezone van de browser.
      const localIso = new Date(draftDatetime).toISOString();
      await setCampaignSchedule(campaignId, localIso);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Opslaan mislukt. Probeer opnieuw.",
      );
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await suggestCampaignSchedule(campaignId, true);
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Nieuw voorstel mislukt. Probeer opnieuw.",
      );
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--accent, #1F4A2D)",
    marginBottom: 4,
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">📅 Wanneer plaatsen?</div>
          <div className="card-st">
            Filly stelt het beste moment voor op basis van type campagne
            en jouw doelgroep.
          </div>
        </div>
      </div>
      <div className="card-b">
        {editing ? (
          // ────────────────────────────────────────────────
          // Edit-mode: handmatige datetime-input
          // ────────────────────────────────────────────────
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ts)",
              }}
            >
              <span>Verzenddatum + tijd</span>
              <input
                type="datetime-local"
                value={draftDatetime}
                onChange={(e) => setDraftDatetime(e.target.value)}
                style={{
                  padding: "8px 10px",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: "var(--white, #FFFFFF)",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={saveEdit}
                disabled={!draftDatetime}
                loading={loading}
              >
                Opslaan
              </Button>
              <Button
                variant="secondary"
                onClick={() => setEditing(false)}
                disabled={loading}
              >
                Annuleren
              </Button>
            </div>
          </div>
        ) : scheduledFor ? (
          // ────────────────────────────────────────────────
          // Bevestigd: toon definitieve tijd
          // ────────────────────────────────────────────────
          <div>
            <div style={labelStyle}>Bevestigd verzendmoment</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
                color: "var(--text)",
              }}
            >
              {formatDutchDateTime(scheduledFor)}
            </div>
            {status === "concept" && (
              <Button
                variant="secondary"
                onClick={startEdit}
                disabled={loading}
              >
                ✎ Wijzig
              </Button>
            )}
          </div>
        ) : suggestedFor ? (
          // ────────────────────────────────────────────────
          // Voorstel zonder bevestiging: accepteer of wijzig
          // ────────────────────────────────────────────────
          <div>
            <div style={labelStyle}>✨ Filly stelt voor</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 4,
                color: "var(--text)",
                textTransform: "capitalize",
              }}
            >
              {formatDutchDateTime(suggestedFor)}
            </div>
            {suggestedReasoning && (
              <div
                style={{
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--ts)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {suggestedReasoning}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Button onClick={accept} loading={loading}>
                ✓ Accepteer dit moment
              </Button>
              <Button
                variant="secondary"
                onClick={startEdit}
                disabled={loading}
              >
                ✎ Wijzig zelf
              </Button>
              <button
                onClick={regenerate}
                disabled={loading}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  color: "var(--ts)",
                  border: "1px solid var(--border, #E5DFD0)",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                ↻ Andere suggestie
              </button>
            </div>
          </div>
        ) : (
          // ────────────────────────────────────────────────
          // Loading-skelet of error tijdens auto-bootstrap
          // ────────────────────────────────────────────────
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--tl)",
              fontStyle: "italic",
            }}
          >
            {loading
              ? "Filly bedenkt het beste moment…"
              : "Geen voorstel beschikbaar."}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "var(--red-soft, #fee)",
              color: "var(--red, #b00)",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
