/**
 * Alle drempels van de kennisbank op één plek, met uitleg in gewoon Nederlands.
 * Vastgepind in knowledge.spec.ts, zodat een aanpassing bewust gebeurt.
 */
export const KNOWLEDGE_PARAMS = {
  /** Vanaf hoeveel metingen in één groep we iets durven te zeggen. */
  minObservations: 2,
  /** Vanaf hoeveel metingen én bronnen we "midden" vertrouwen geven. */
  midObservations: 3,
  /** Vanaf hoeveel metingen én verschillende bronnen we "hoog" vertrouwen geven. */
  highObservations: 5,
  highSources: 2,
  /** Een verschil kleiner dan dit (10%) tellen we als "geen verschil" en slaan we niet op. */
  minAbsLift: 0.1,
  /** Data verliest de helft van zijn gewicht na zoveel dagen. */
  halfLifeDays: 365,
  /** Weging van de bron: 1 = zwak (mening), 2 = normaal, 3 = sterk (studie of eigen meting). */
  reliabilityWeight: { 1: 0.5, 2: 1, 3: 1.5 } as Record<number, number>,
  /** Hoeveel inzichten per kanaal in de prompt van Filly komen. */
  briefTopPositive: 3,
  briefTopNegative: 2,
  /** Laagste vertrouwen dat Filly nog te zien krijgt. */
  briefMinConfidence: 'midden' as const,
} as const;

export type KnowledgeConfidence = 'laag' | 'midden' | 'hoog';

/** Welke eigenschappen we los van elkaar vergelijken binnen een kanaal. */
export const KNOWLEDGE_DIMENSIONS = ['format', 'topic', 'daypart'] as const;
export type KnowledgeDimension = (typeof KNOWLEDGE_DIMENSIONS)[number];
