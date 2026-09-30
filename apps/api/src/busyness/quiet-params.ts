/**
 * ============================================================
 * Parameters van de rustige-momenten-detectie
 * ============================================================
 *
 * Eén plek voor de getallen die bepalen WANNEER een moment een kans is, met
 * uitleg in gewone taal. De detectie (quiet-model.ts) leest deze standaard-
 * waarden; tests en de speeltuin kunnen ze per aanroep overschrijven.
 *
 * Herkomst van de waarden: zie docs/werking/rustige-momenten-model-v2.docx.
 */
export type Dagdeel = 'ochtend' | 'lunch' | 'middag' | 'diner';

export interface QuietParams {
  /** Uren na opening waarin niets wordt voorgesteld (dan wordt er klaargezet). */
  openMarginHours: number;
  /** Uren voor sluiting waarin niets wordt voorgesteld (dan wordt er afgebouwd). */
  closeMarginHours: number;
  /** Lengte (uren) van het rustige tijdvenster dat we binnen een dagdeel zoeken. */
  windowHours: number;
  /**
   * Kansdrempel als deel van je piek (0,35 = 35%): het gat met je drukste
   * blok moet minstens zo groot zijn. Hoger = strenger.
   */
  gapFrac: number;
  /** Hoe zwaar een "ongewoon rustig" moment extra meetelt in de volgorde. */
  anomalyWeight: number;
  /** Vanaf hoeveel keer de normale schommeling een moment "ongewoon rustig" heet. */
  unusualSpreadMult: number;
  /** Ondergrens voor "ongewoon": minimaal dit deel (0,12 = 12%) onder het verwachte niveau. */
  relDevFloor: number;
  /** Hoe zwaar een evenement in de buurt meetelt in de score. */
  eventBonusWeight: number;
  /** Vanaf welke score een evenement-kans boven het tempo uit mag ("kans van de week"). */
  exceptionScore: number;
  /**
   * Haalbaarheid 0 tot 1 per dagdeel en weekdag (ma tot zo). Hoe goed een
   * moment te bereiken is; vermenigvuldigt de score. Onze eerste aanname,
   * bij te stellen met eigen metingen.
   */
  haalbaarheid: Record<Dagdeel, number[]>;
  /** Minimaal aantal open uren voor een dagdeel in de bezettingsrapportage. */
  minCoverage: number;
  /** Tempo als de zaak zelf niets heeft ingesteld (per zaak instelbaar, 1 tot 6). */
  defaultPerWeek: number;
}

export const QUIET_PARAMS: QuietParams = {
  openMarginHours: 1,
  closeMarginHours: 2,
  windowHours: 2,
  gapFrac: 0.35,
  anomalyWeight: 0.5,
  unusualSpreadMult: 2.0,
  relDevFloor: 0.12,
  eventBonusWeight: 0.5,
  exceptionScore: 0.8,
  haalbaarheid: {
    ochtend: [0.3, 0.3, 0.3, 0.3, 0.4, 0.7, 0.7],
    lunch: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
    middag: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
    diner: [0.85, 0.85, 0.85, 0.85, 0.95, 1, 1],
  },
  minCoverage: 2,
  defaultPerWeek: 2,
};
