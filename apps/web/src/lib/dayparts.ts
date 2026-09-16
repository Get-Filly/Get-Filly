// ============================================================
// dayparts — dagdeel-namen in de taal van de gebruiker
// ============================================================
//
// De backend stuurt naast `daypartLabel` ("middag en diner") ook de kale
// sleutels mee (`dayparts: ["middag", "diner"]`). Dat label is een
// Nederlandse zin en hoort in de prompts thuis, niet in de UI: op de Engelse
// kaart stond letterlijk "Tuesday middag en diner is your biggest
// opportunity". Vertalen doen we dus hier, uit de sleutels.
//
// Zelfde principe als QuietMoment.reasonKey: de backend levert een sleutel,
// de frontend maakt er een zin van.

export const DAYPART_KEYS = [
  "ochtend",
  "lunch",
  "middag",
  "diner",
  "avond",
] as const;

type Translator = (key: string) => string;

/** Eén dagdeel, vertaald. Onbekende sleutel → de sleutel zelf (fail-soft). */
export function daypartName(t: Translator, key: string): string {
  if (!(DAYPART_KEYS as readonly string[]).includes(key)) return key;
  return t(key);
}

/**
 * Hoe je een rustig blok noemt. Beslaat het élk open dagdeel van die dag,
 * dan is "de hele dag" het eerlijke antwoord: de opsomming "lunch, middag,
 * diner en avond" zegt precies hetzelfde maar leest verwarrend, want lunch
 * zit ín de middag en diner ín de avond.
 */
export function quietBlockText(
  t: Translator,
  m: { dayparts?: string[]; coversOpenDay?: boolean; daypartLabel?: string },
): string {
  if (m.coversOpenDay) return t("wholeDay");
  return daypartsText(t, m.dayparts, m.daypartLabel ?? "");
}

/**
 * Meerdere dagdelen natuurlijk aan elkaar, in de taal van de gebruiker:
 * ["diner", "avond"] → "diner en avond" / "dinner and evening".
 * Spiegelt joinDayparts in de backend, maar dan vertaald.
 *
 * `fallback` is het door de backend geleverde NL-label; dat gebruiken we
 * alleen als er geen sleutels zijn (oudere response zonder `dayparts`).
 */
export function daypartsText(
  t: Translator,
  keys: string[] | undefined,
  fallback = "",
): string {
  if (!keys || keys.length === 0) return fallback;
  const names = keys.map((k) => daypartName(t, k));
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ${t("and")} ${names[names.length - 1]}`;
}
