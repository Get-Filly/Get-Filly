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
  /** Hoe zwaar een feestdag meetelt in de score (een feestdag is een moment om op in te spelen). */
  holidayBonusWeight: number;
  /** Vanaf welke score een evenement- of feestdag-kans boven het tempo uit mag ("kans van de week"). */
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
  holidayBonusWeight: 0.5,
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

/**
 * Datum-signalen: hoe weer en evenementen de verwachte drukte of de score
 * verschuiven. De waarden komen uit de literatuur (Rabobank, Ohio State,
 * evenementen.nl-categorieen) en zijn nog niet met eigen metingen getoetst;
 * zie docs/werking/calibratie-weer-evenementen.sql.
 */
export interface SignalParams {
  /** Weer: vanaf deze temperatuur (graden) en droog telt het als terrasweer. */
  weatherWarmMinC: number;
  /** Weer: boven deze temperatuur blijven mensen binnen (hitte). */
  weatherHeatMinC: number;
  /** Weer: bij deze temperatuur of lager is het koud. */
  weatherColdMaxC: number;
  /** Verwachte drukte bij terrasweer, met eigen terras (1,25 = 25% drukker). */
  weatherTerraceBoost: number;
  /** Verwachte drukte bij terrasweer zonder terras. */
  weatherWarmBoost: number;
  /** Verwachte drukte bij regen, buien of onweer (0,85 = 15% rustiger). */
  weatherWetDamp: number;
  /** Verwachte drukte bij kou. */
  weatherColdDamp: number;
  /** Verwachte drukte bij hitte. */
  weatherHeatDamp: number;
  /** Gewicht per soort evenement (1,0 = het zwaarst). */
  eventWeight: Record<string, number>;
  /** Gewicht voor een onbekende soort. */
  eventDefaultWeight: number;
  /** Een festival op de stoep telt maximaal zoveel mee (0,5 = plus 50%). */
  eventMaxBoost: number;
  /** Plafond op het gezamenlijke effect van meerdere evenementen. */
  eventFactorCeil: number;
  /** Tot hoeveel kilometer een soort evenement meetelt (afstandsstaffel). */
  eventRadiusKm: Record<string, number>;
  /** Vanaf hoeveel afwijking van 1 noemen we een dag incidenteel in plaats van structureel. */
  incidentalMinDamp: number;
}

export const SIGNAL_PARAMS: SignalParams = {
  weatherWarmMinC: 22,
  weatherHeatMinC: 30,
  weatherColdMaxC: 8,
  weatherTerraceBoost: 1.25,
  weatherWarmBoost: 1.1,
  weatherWetDamp: 0.85,
  weatherColdDamp: 0.88,
  weatherHeatDamp: 0.9,
  eventWeight: {
    festivals: 1.0,
    concerten_theater: 0.8,
    sportevenementen: 0.8,
    events: 0.6,
    kermis: 0.4,
    markten: 0.4,
  },
  eventDefaultWeight: 0.6,
  eventMaxBoost: 0.5,
  eventFactorCeil: 1.6,
  eventRadiusKm: {
    kermis: 2,
    markten: 2,
    concerten_theater: 5,
    sportevenementen: 5,
    events: 5,
    festivals: 10,
  },
  incidentalMinDamp: 0.08,
};
