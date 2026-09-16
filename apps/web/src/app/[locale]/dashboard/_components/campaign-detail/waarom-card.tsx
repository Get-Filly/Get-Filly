// ============================================================
// WaaromCard, read-only uitleg van Filly's redenering
// ============================================================
//
// Toont waarom Filly dit voorstel doet, bovenaan de detail-pagina
// zodat eigenaar de context heeft vóór 'ie kanalen of inhoud
// bewerkt. Geen interactie — als reasoning ontbreekt rendert
// 'ie niets (return null) zodat de pagina-flow niet hapert.

import { useTranslations } from "next-intl";
import { quietReasonText } from "@/lib/quiet-reason";

type Props = {
  reasoning: string | null;
  // Waarom Filly juist DEZE dag koos. Komt als sleutel + gegevens mee met de
  // campagne; de zin wordt hier gemaakt omdat de app NL/EN is. Voorheen bleef
  // dit in trigger_context hangen: op de campagne zelf was later niet meer te
  // zien waarom die dag gekozen was.
  dayReason?: {
    key: string;
    params: Record<string, string | number>;
    kind: "structureel" | "incidenteel" | null;
    targetDate: string | null;
  } | null;
};

// Houd "Waarom dit voorstel" kort (zoals bedoeld: 1-2 zinnen). Twee bronnen
// van lengte worden hier weggenomen voor de weergave (data blijft intact):
//   1. Het "💡 Alternatief: …"-aanhangsel dat de backend achter de reasoning
//      plakt — dat hoort niet in de korte waarom-samenvatting.
//   2. Een redenering die alsnog uit >2 zinnen bestaat → cap op de eerste 2.
function conciseReasoning(text: string): string {
  const core = text.split(/💡\s*Alternatief/i)[0].trim();
  const sentences = core.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (sentences && sentences.length > 2) {
    return sentences.slice(0, 2).join("").trim();
  }
  return core;
}

export function WaaromCard({ reasoning, dayReason }: Props) {
  const t = useTranslations("dash__components_campaign_detail_waarom_card");
  const tReason = useTranslations("common.quietReasons");
  const dagReden = quietReasonText(
    tReason,
    dayReason?.key,
    dayReason?.params,
  );
  // Zonder Filly's uitleg én zonder dag-reden valt er niets te tonen.
  if (!reasoning && !dagReden) return null;
  const text = reasoning ? conciseReasoning(reasoning) : null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">{t("title")}</div>
        </div>
      </div>
      <div className="card-b">
        {text && (
          <div
            style={{
              fontSize: 14,
              color: "var(--text)",
              lineHeight: 1.6,
            }}
          >
            {text}
          </div>
        )}
        {dagReden && (
          <div
            style={{
              fontSize: 13.5,
              color: "var(--tl)",
              lineHeight: 1.6,
              marginTop: text ? 10 : 0,
              paddingTop: text ? 10 : 0,
              borderTop: text ? "1px solid var(--border, #E5DFD0)" : undefined,
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {dayReason?.kind === "incidenteel"
                ? t("whyDayIncidental")
                : t("whyDay")}
            </span>{" "}
            {dagReden}
          </div>
        )}
      </div>
    </div>
  );
}
