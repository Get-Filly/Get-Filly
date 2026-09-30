import type {
  KnowledgeConfidence,
  KnowledgeDimension,
} from './knowledge-params';

/** Eén genormaliseerde meting uit een bron. Alleen channel, metric en value zijn verplicht. */
export interface Observation {
  sourceId: string;
  channel: string; // instagram | facebook | tiktok | google_business
  format?: string | null; // carrousel | reel | foto | video | story | tekst
  topic?: string | null; // gerecht | sfeer | aanbieding | achter_de_schermen | ...
  country?: string | null;
  region?: string | null;
  weekday?: number | null; // 0 = maandag
  daypart?: string | null; // ochtend | lunch | middag | diner
  season?: string | null;
  metric: string; // bereik | interactie | doorklik | reserveringen | ...
  unit?: string | null; // procent | aantal | ...
  value: number;
  sampleSize?: number | null;
  periodEnd?: string | null; // ISO-datum
  /** 1 tot 3, uit de bron (kb_sources.reliability). */
  reliability?: number | null;
}

export interface Insight {
  channel: string;
  dimension: KnowledgeDimension;
  dimensionValue: string;
  metric: string;
  unit: string | null;
  /** 0.35 = 35% boven het gemiddelde van dit kanaal, -0.2 = 20% eronder. */
  lift: number;
  nObservations: number;
  nSources: number;
  totalSample: number;
  confidence: KnowledgeConfidence;
}

/** Instructie voor het omzetten van een ruw bestand naar metingen. */
export interface ImportMapping {
  /** Per veld: kolomnaam in het bestand, of { column, map } om waarden te vertalen. */
  fields: Partial<
    Record<
      | 'channel'
      | 'format'
      | 'topic'
      | 'country'
      | 'region'
      | 'weekday'
      | 'daypart'
      | 'season'
      | 'metric'
      | 'unit'
      | 'value'
      | 'sampleSize'
      | 'periodEnd',
      string | { column: string; map?: Record<string, string> }
    >
  >;
  /** Vaste waarden voor het hele bestand, bijvoorbeeld { channel: "instagram" }. */
  constants?: Partial<
    Record<
      'channel' | 'format' | 'topic' | 'country' | 'region' | 'daypart' | 'season' | 'metric' | 'unit',
      string
    >
  >;
  /** "nl" = komma als decimaalteken (1.234,5). Standaard "en". */
  numberLocale?: 'nl' | 'en';
}

export interface NormalizeResult {
  observations: Omit<Observation, 'sourceId' | 'reliability'>[];
  skipped: number;
  reasons: Record<string, number>;
}
