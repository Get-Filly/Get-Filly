// ============================================================
// LegalField — toont een waarde óf een placeholder
// ============================================================
// Gebruikt op /privacy en /voorwaarden om elk veld uit
// `COMPANY` te renderen. Zolang de bedrijfsgegevens nog niet
// zijn ingevuld (KvK, adres, etc.) ziet de bezoeker een
// gele highlight met "[NOG IN TE VULLEN: ...]" zodat duidelijk
// is welke onderdelen van de juridische tekst nog onvolledig
// zijn — én zodat we tijdens de jurist-review snel kunnen
// scannen welke plekken nog gevuld moeten worden.
//
// Zodra het bijbehorende veld in `apps/web/src/config/company.ts`
// gevuld is, vervangt de waarde automatisch de placeholder
// zonder dat we de pagina-tekst zelf hoeven aan te passen.
// ============================================================

import type { ReactNode } from "react";

type Props = {
  // Actuele waarde uit de config. Mag null zijn — dan toont
  // de component de placeholder.
  value: string | null;

  // Korte hint over wát hier moet komen (bv. "KvK-nummer").
  // Zichtbaar voor de bezoeker zodat ook zij begrijpen dat dit
  // bewust nog leeg is in de concept-versie.
  placeholder: string;

  // Optionele wrapper voor de waarde wanneer 'm wel gevuld is.
  // Bv. <strong> voor de bedrijfsnaam in sectie 1.
  children?: (value: string) => ReactNode;
};

export function LegalField({ value, placeholder, children }: Props) {
  if (value) {
    return <>{children ? children(value) : value}</>;
  }
  return (
    <span className="legal-placeholder">[NOG IN TE VULLEN: {placeholder}]</span>
  );
}
