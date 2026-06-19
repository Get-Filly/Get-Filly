"use client";

import { useTranslations } from "next-intl";

import { useActionableDays } from "@/lib/use-actionable-days";

// ============================================================
// <UpcomingActionsBlock>, alert-stroken (rustige + speciale dagen)
// ============================================================
//
// Zelfstandige block die rustige dagen (komende 14 dgn) + speciale
// dagen (komende 6 wkn) toont als 2 ALTIJD-zichtbare stroken. Puur
// een glanceable status-/alert-overzicht; het maken van een actie
// gebeurt in de Filly-chat (geleide flow). De losse "Vraag Filly om
// voorstellen"-knop is daarom verwijderd (2026-06-12).
//
// Elke strook heeft z'n eigen status-kleur (per Floris-feedback
// 2026-05-29, gescheiden i.p.v. één gecombineerde strook):
//   - ROOD accent  = er staan nog open dagen die actie vragen
//   - GROEN accent = onder controle (alle dagen afgedekt met een
//     voorstel/campagne, óf er waren simpelweg geen zulke dagen)
//
// De block verdwijnt dus NIET meer op een rustig dashboard: de
// eigenaar ziet altijd in één oogopslag de status van beide
// categorieën (rustige bezetting + komende speciale dagen).
//
// Gedeeld door:
//   - dashboard/page.tsx (layout="grid-4col", aligned met KPI-rij)
//   - dashboard/campagnes/page.tsx (layout="flex", strips groei +
//     knop natuurlijke breedte)

function formatDayNl(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

type Layout = "grid-4col" | "flex";

type Props = {
  layout?: Layout;
};

export function UpcomingActionsBlock({ layout = "flex" }: Props) {
  const t = useTranslations("dash__components_upcoming_actions_block");

  // Gedeelde bron-van-waarheid met de geleide chat-flow (audit-item #5):
  // dezelfde rustige-/speciale-dagen-berekening leeft nu in één hook,
  // i.p.v. hier los gedupliceerd (drift-risico). We aliassen de
  // hook-velden naar de namen die de render hieronder gebruikt.
  const {
    lowOccupancyDays: criticalDays,
    specialDays: upcomingSpecial,
    coveredLowOccupancyCount: coveredCritical,
    coveredSpecialCount: coveredSpecial,
  } = useActionableDays();

  // Strook-styling: witte bg, dunne 4px kleurstreep links, zwarte tekst.
  // De accentkleur verschilt per status: rood-700 = actie nodig,
  // British-Racing-Green = onder controle. accentStrip(kleur) bouwt de
  // juiste style zodat beide stroken dezelfde basis delen.
  const stripBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "var(--color-white, #FFFFFF)",
    border: "1px solid var(--border, #E5DFD0)",
    color: "var(--text, #18181B)",
    borderRadius: "var(--rs, 8px)",
    fontSize: 13,
    lineHeight: 1.4,
  };
  const RED = "#B91C1C"; // rood-700 — actie nodig
  const GREEN = "#1F4A2D"; // British Racing Green — onder controle
  const accentStrip = (color: string): React.CSSProperties => ({
    ...stripBase,
    boxShadow: `inset 4px 0 0 0 ${color}`,
  });

  // Rustige-dagen-strook: ALTIJD zichtbaar. Rood als er nog open rustige
  // dagen zijn, groen als alles onder controle is. De groene tekst
  // onderscheidt "alle afgedekt met campagnes" van "simpelweg geen
  // rustige dagen".
  const occupancyStrip = (
    <div style={accentStrip(criticalDays.length > 0 ? RED : GREEN)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {criticalDays.length > 0 ? (
          <>
            <strong>
              {t("lowOccupancyCount", { count: criticalDays.length })}
            </strong>{" "}
            {t("nextTwoWeeks")}{" "}
            {criticalDays
              .slice(0, 5)
              .map((d) => `${formatDayNl(d.date)} (${d.occupancy_pct}%)`)
              .join(", ")}
            {criticalDays.length > 5 &&
              t("moreSuffix", { count: criticalDays.length - 5 })}
          </>
        ) : coveredCritical > 0 ? (
          <>
            <strong>{t("lowOccupancyCoveredTitle")}</strong>{" "}
            {t("lowOccupancyCovered", { count: coveredCritical })}
          </>
        ) : (
          <>
            <strong>{t("noLowOccupancyTitle")}</strong>{" "}
            {t("noLowOccupancy")}
          </>
        )}
      </div>
    </div>
  );

  // Speciale-dagen-strook: ALTIJD zichtbaar. Zelfde rood/groen-logica
  // voor de komende 6 weken.
  const specialStrip = (
    <div style={accentStrip(upcomingSpecial.length > 0 ? RED : GREEN)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {upcomingSpecial.length > 0 ? (
          <>
            <strong>
              {t("specialCount", { count: upcomingSpecial.length })}
            </strong>{" "}
            {t("nextSixWeeks")}{" "}
            {upcomingSpecial
              .slice(0, 5)
              .map((s) => `${s.name} (${formatDayNl(s.date)})`)
              .join(", ")}
            {upcomingSpecial.length > 5 &&
              t("moreSuffix", { count: upcomingSpecial.length - 5 })}
          </>
        ) : coveredSpecial > 0 ? (
          <>
            <strong>{t("specialCoveredTitle")}</strong>{" "}
            {t("specialCovered", { count: coveredSpecial })}
          </>
        ) : (
          <>
            <strong>{t("noSpecialTitle")}</strong>{" "}
            {t("noSpecial")}
          </>
        )}
      </div>
    </div>
  );

  // grid-4col: dashboard-mode, 4 even cols zodat strips/knop precies
  // uitlijnen met de KPI-rij eronder (3 cols strips + 1 col knop).
  if (layout === "grid-4col") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {occupancyStrip}
          {specialStrip}
        </div>
      </div>
    );
  }

  // flex-mode (default): strips groei, knop pakt z'n natuurlijke
  // breedte. Voor pagina's zonder vaste kolom-grid (zoals /campagnes).
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {occupancyStrip}
        {specialStrip}
      </div>
    </div>
  );
}
