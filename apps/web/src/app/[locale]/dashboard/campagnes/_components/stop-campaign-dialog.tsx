"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { CampaignRetractReport } from "@/lib/api";

// ============================================================
// StopCampaignDialog — een actieve campagne stopzetten
// ============================================================
// Twee fases in één venster:
//
//   1. Bevestigen. Stoppen verwijdert de posts bij Facebook en
//      Instagram, en dat is onomkeerbaar.
//   2. Resultaat. Per kanaal of de post écht weg is.
//
// Die tweede fase is het punt. Tot september 2026 gebeurde het
// verwijderen stil: lukte het niet, dan stond dat alleen in de
// serverlogs en zag de eigenaar een campagne die netjes naar Concept
// verhuisde -- terwijl de post gewoon live bleef. Nu zijn "de campagne
// is gestopt" en "de post is weg" niet langer hetzelfde bericht.
//
// Losse component zodat /proto-stop-popup precies dit venster kan tonen
// zonder login, en niet een nagebouwde versie ervan.

export type StopCampaignDialogProps = {
  /** Bezig met stoppen: knoppen op slot. */
  busy: boolean;
  /** null = nog bevestigen; gevuld = klaar, toon het resultaat. */
  result: CampaignRetractReport | null;
  onConfirm: () => void;
  onClose: () => void;
};

export function StopCampaignDialog({
  busy,
  result,
  onConfirm,
  onClose,
}: StopCampaignDialogProps) {
  const t = useTranslations("campagnes_page");

  const done = result !== null;
  // Er staat nog iets live. Dan is de directe link het enige dat de
  // eigenaar nog verder helpt.
  const stuck =
    done && (result.facebook === "failed" || result.instagram === "failed");
  const raw = result?.instagramManualUrl ?? "";
  const href = raw && raw.startsWith("http") ? raw : "https://www.instagram.com";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stop-campaign-title"
      onClick={() => {
        if (!busy) onClose();
      }}
      style={overlay}
    >
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <h3 id="stop-campaign-title" style={titleStyle}>
          {done
            ? stuck
              ? t("igStopPopup.doneTitlePartial")
              : t("igStopPopup.doneTitle")
            : t("igStopPopup.title")}
        </h3>
        <p style={bodyStyle}>
          {done ? t("igStopPopup.doneBody") : t("igStopPopup.body")}
        </p>

        {/* Per kanaal wat er gebeurd is. Dit is het bewijs dat de post
            echt weg is, niet alleen dat de kaart van kolom wisselde. */}
        {done && (
          <ul style={listStyle}>
            {(["facebook", "instagram"] as const)
              // 'skipped' = er stond niets op dat kanaal. Daar valt niets
              // over te melden; iets melden zou suggereren dat er iets
              // verwijderd is.
              .filter((k) => result[k] !== "skipped")
              .map((k) => {
                const deleted = result[k] === "deleted";
                return (
                  <li key={k} style={rowStyle}>
                    <span aria-hidden="true">{deleted ? "✓" : "✕"}</span>
                    <span
                      style={{
                        color: deleted ? "var(--brand, #1F4A2D)" : "#B3261E",
                      }}
                    >
                      {t(
                        deleted
                          ? `igStopPopup.removed.${k}`
                          : `igStopPopup.failed.${k}`,
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}

        {/* Eén melding, niet twee. Als er iets is blijven staan wil de
            eigenaar twee dingen weten: waaróm, en hoe hij de post alsnog
            weg krijgt. Een ontbrekende permissie is de meest waarschijnlijke
            oorzaak en heeft een eigen oplossing (opnieuw verbinden); in alle
            andere gevallen blijft het bij de directe link. */}
        {stuck && (
          <div style={noticeBox}>
            <div style={noticeTitle}>
              {result.needsReconnect
                ? t("igStopPopup.reconnectTitle")
                : t("igStopPopup.noticeTitle")}
            </div>
            <div style={noticeBody}>
              {result.needsReconnect
                ? t("igStopPopup.reconnectBody")
                : t("igStopPopup.noticeBody")}
            </div>
            <div style={noticeActions}>
              {result.needsReconnect && (
                // Link uit @/i18n/navigation, niet <a>: anders valt de
                // gebruiker op /en terug naar het Nederlandse pad.
                <Link href="/dashboard/koppelingen" style={noticeLink}>
                  {t("igStopPopup.reconnectCta")}
                </Link>
              )}
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={result.needsReconnect ? noticeLinkGhost : noticeLink}
              >
                {t("igStopPopup.open")}
              </a>
            </div>
          </div>
        )}

        <div style={footerStyle}>
          {done ? (
            <Button variant="secondary" onClick={onClose}>
              {t("igStopPopup.close")}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                {t("igStopPopup.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={busy}
                onClick={onConfirm}
              >
                {t("igStopPopup.confirm")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(14,43,23,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};
const panel: React.CSSProperties = {
  background: "var(--white, #FFFFFF)",
  borderRadius: 12,
  padding: 24,
  maxWidth: 440,
  width: "100%",
};
const titleStyle: React.CSSProperties = { margin: "0 0 6px", fontSize: 18 };
const bodyStyle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 13,
  color: "var(--ts)",
  lineHeight: 1.5,
};
const listStyle: React.CSSProperties = {
  margin: "0 0 16px",
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 6,
  fontSize: 13,
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

// Amber, niet rood: een let-op, geen storing.
const noticeBox: React.CSSProperties = {
  margin: "0 0 16px",
  padding: "12px 14px",
  background: "#FBF1DD",
  border: "1px solid #EAD9AE",
  borderRadius: 8,
};
const noticeTitle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: "#8A5A00",
  marginBottom: 4,
};
const noticeBody: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "#8A5A00",
};
const noticeActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};
const noticeLink: React.CSSProperties = {
  display: "inline-block",
  padding: "7px 13px",
  fontSize: 12.5,
  fontWeight: 500,
  background: "var(--brand, #1F4A2D)",
  color: "#FFFFFF",
  borderRadius: 7,
  textDecoration: "none",
};
// Tweede knop in hetzelfde blok: minder nadruk, zodat de aanbevolen
// stap (opnieuw verbinden) de primaire blijft.
const noticeLinkGhost: React.CSSProperties = {
  display: "inline-block",
  padding: "7px 13px",
  fontSize: 12.5,
  fontWeight: 500,
  background: "transparent",
  color: "#8A5A00",
  border: "1px solid #EAD9AE",
  borderRadius: 7,
  textDecoration: "none",
};
