// ============================================================
// WaaromCard, read-only uitleg van Filly's redenering
// ============================================================
//
// Toont waarom Filly dit voorstel doet, bovenaan de detail-pagina
// zodat eigenaar de context heeft vóór 'ie kanalen of inhoud
// bewerkt. Geen interactie — als reasoning ontbreekt rendert
// 'ie niets (return null) zodat de pagina-flow niet hapert.

import { useTranslations } from "next-intl";

type Props = {
  reasoning: string | null;
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

export function WaaromCard({ reasoning }: Props) {
  const t = useTranslations("dash__components_campaign_detail_waarom_card");
  if (!reasoning) return null;
  const text = conciseReasoning(reasoning);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div>
          <div className="card-t">{t("title")}</div>
        </div>
      </div>
      <div className="card-b">
        <div
          style={{
            fontSize: 14,
            color: "var(--text)",
            lineHeight: 1.6,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
