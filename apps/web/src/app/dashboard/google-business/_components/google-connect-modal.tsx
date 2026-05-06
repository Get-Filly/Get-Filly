"use client";

import { useEffect, useState } from "react";
import {
  searchGoogleProfile,
  connectGoogleProfile,
  type GooglePlaceSearchResult,
  type GooglePlaceDetails,
} from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";

/**
 * ============================================================
 * GoogleConnectModal, koppel een Google Business Profile vanuit hub
 * ============================================================
 *
 * Wordt geopend via de "Koppel met Google"-knop in de hub-status-banner.
 * Search-flow:
 *   1. Modal opent met een leeg zoek-veld + "Zoek"-knop
 *   2. Klant typt naam + stad → klikt Zoek
 *   3. Backend retourneert max 5 matches
 *   4. Klant klikt op een match → connect-call → modal sluit
 *   5. Parent (hub) krijgt onConnected-callback met nieuwe data
 *
 * Verschilt bewust van de wizard-section (apps/web/.../onboarding/page.tsx):
 * daar gebruiken we een sparse inline-search omdat 'ie binnen een form
 * zit en compact moet blijven. Hier in de hub hebben we ruimte voor
 * een echte modal-overlay met focus-trap (Escape-key, klik-buiten).
 *
 * Geen react-helpers/portal, de codebase doet dit overal met een
 * fixed-position div op het body-niveau. Past bij de andere modals
 * (campaign-send-modal, menu-upload-modal).
 * ============================================================
 */
export function GoogleConnectModal({
  open,
  onClose,
  onConnected,
  initialQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (data: GooglePlaceDetails) => void;
  // Optionele pre-fill, bv. de restaurant-naam uit z'n profiel zodat
  // de eerste zoekopdracht direct relevant is.
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GooglePlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // placeId being connected
  const [error, setError] = useState<string | null>(null);

  // Reset state als modal sluit zodat een herbezoek met clean lei begint.
  useEffect(() => {
    if (!open) {
      setQuery(initialQuery);
      setResults([]);
      setSearching(false);
      setConnecting(null);
      setError(null);
    } else {
      // Pre-fill bij openen + auto-search als er een initial-query is.
      // Bespaart de eigenaar twee klikken in 80% van de gevallen.
      setQuery(initialQuery);
      if (initialQuery.length >= 3) {
        runSearch(initialQuery);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape-key sluit modal, past bij de andere dashboard-modals
  // (campaign-send-modal etc.) qua keyboard-gedrag.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function runSearch(q?: string) {
    const finalQuery = (q ?? query).trim();
    if (finalQuery.length < 3) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchGoogleProfile(finalQuery);
      setResults(found);
      if (found.length === 0) {
        setError(
          "Geen resultaten gevonden. Probeer met meer detail (naam + stad).",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoeken niet gelukt.");
    } finally {
      setSearching(false);
    }
  }

  async function selectAndConnect(place: GooglePlaceSearchResult) {
    setConnecting(place.placeId);
    setError(null);
    try {
      const result = await connectGoogleProfile(place.placeId);
      onConnected(result.data);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Koppelen niet gelukt.",
      );
      setConnecting(null);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gpc-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
      }}
      onClick={(e) => {
        // Klik op de backdrop sluit de modal. Klik op de witte
        // content-box stoppen we hieronder met stopPropagation.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "white",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "var(--space-5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "var(--space-4)",
          }}
        >
          <div>
            <div
              id="gpc-modal-title"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text, #18181B)",
              }}
            >
              Koppel je Google Business Profile
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary, #52525B)",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              Zoek op naam + stad. Filly haalt direct je profielinfo op.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "var(--text-secondary, #52525B)",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="bv. 'De Kas Amsterdam'"
            autoFocus
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 14,
              border: "1px solid var(--color-border, #E4E4E7)",
              borderRadius: "var(--radius-md)",
            }}
          />
          <Button
            variant="primary"
            onClick={() => runSearch()}
            disabled={searching || query.trim().length < 3}
          >
            {searching ? "Zoeken…" : "Zoek"}
          </Button>
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: "#B00020",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              marginBottom: "var(--space-4)",
            }}
          >
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {results.map((r) => (
              <button
                key={r.placeId}
                type="button"
                onClick={() => selectAndConnect(r)}
                disabled={connecting !== null}
                style={{
                  textAlign: "left",
                  padding: "var(--space-3) var(--space-4)",
                  border: "1px solid var(--color-border, #E4E4E7)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor:
                    connecting === r.placeId ? "#F3F4F6" : "white",
                  cursor: connecting !== null ? "default" : "pointer",
                  opacity: connecting !== null && connecting !== r.placeId ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--text, #18181B)",
                  }}
                >
                  {r.displayName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary, #52525B)",
                    marginTop: 4,
                  }}
                >
                  {r.formattedAddress}
                </div>
                {r.rating !== null && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary, #52525B)",
                      marginTop: 4,
                    }}
                  >
                    ⭐ {r.rating.toFixed(1)}
                    {r.userRatingCount !== null &&
                      ` (${r.userRatingCount.toLocaleString("nl-NL")} reviews)`}
                  </div>
                )}
                {connecting === r.placeId && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-brand, #1F4A2D)",
                      marginTop: 6,
                      fontWeight: 500,
                    }}
                  >
                    Koppelen…
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {results.length === 0 && !searching && !error && query.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary, #52525B)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "var(--space-6) 0",
            }}
          >
            Typ een zoekopdracht en klik Zoek.
          </div>
        )}
      </div>
    </div>
  );
}
