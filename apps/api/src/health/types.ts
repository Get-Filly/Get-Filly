/**
 * ============================================================
 * health/types.ts — gedeelde types voor de Vindbaarheid-module
 * ============================================================
 *
 * Wat staat hier?
 *   - Union-types voor categorie en severity (matchen 1:1 met de
 *     check-constraints in migratie 0044).
 *   - HealthFinding: één bevinding (geslaagd of gefaald) per run.
 *   - HealthCompetitor: één concurrent in de 500m-straal.
 *   - HealthSnapshot: het hele resultaat van 1 audit-run.
 *   - HealthRunner: interface die alle 5 runners moeten implementeren.
 *
 * Waarom een centraal types-file?
 *   Front-end en alle 5 runners hangen aan dezelfde shape. Door het
 *   centraal te houden krijgen we 1 plek waar de "API-contract" leeft,
 *   en TypeScript schreeuwt zodra iets uit sync raakt.
 */

// ============================================================
// Union-types: matchen de check-constraints uit migratie 0044.
// Wijzig je deze, wijzig dan ook de SQL-check (en vice versa).
// ============================================================

export type HealthCategory = 'seo' | 'gbp' | 'reviews' | 'geo';

export type HealthSeverity =
  | 'info'      // alleen informatief, geen punten-impact
  | 'low'       // klein puntje, niet urgent
  | 'medium'    // merkbare impact op vindbaarheid
  | 'high'      // belangrijke fix die meerdere punten oplevert
  | 'critical'; // blokkerend voor SEO/GEO, hoogste prioriteit

export type HealthRunSource = 'manual' | 'cron' | 'onboarding';

// ============================================================
// Domain-types (rijen uit de DB, camelCased voor de front-end).
// ============================================================

export interface HealthFinding {
  id: string;
  healthScoreId: string;
  restaurantId: string;
  category: HealthCategory;
  /** Stabiele identifier, bv. 'seo.meta_description_present'. */
  checkKey: string;
  passed: boolean;
  severity: HealthSeverity;
  /** 0-100. Hoeveel punten je verliest als deze check faalt. */
  pointsLost: number;
  title: string;
  description: string | null;
  fixSuggestion: string | null;
  fixLink: string | null;
  /** Rauwe meetwaarden (gemeten ms, gevonden URL, etc.). */
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface HealthCompetitor {
  id: string;
  healthScoreId: string;
  restaurantId: string;
  placeId: string;
  name: string;
  distanceM: number;
  scoreTotal: number | null;
  scoreGbp: number | null;
  scoreReviews: number | null;
  rawData: Record<string, unknown> | null;
  rankInRadius: number;
}

export interface HealthSnapshot {
  id: string;
  restaurantId: string;
  scoreTotal: number;
  scoreSeo: number;
  scoreGbp: number;
  scoreReviews: number;
  scoreGeo: number;
  ranAt: string;
  runDurationMs: number | null;
  runSource: HealthRunSource;
  runnerVersion: string;
}

/** Volledig resultaat van 1 run, zoals de front-end het wil renderen. */
export interface HealthSnapshotFull extends HealthSnapshot {
  findings: HealthFinding[];
  competitors: HealthCompetitor[];
}

// ============================================================
// Runner-contract: elke categorie (SEO, GBP, Reviews, GEO) bouwt
// zijn eigen runner die dit interface implementeert. De
// HealthService roept ze parallel aan en aggregeert het resultaat.
// ============================================================

/**
 * Resultaat dat een runner teruggeeft. De runner berekent zélf
 * een sub-score (0-100) en leverde de lijst findings die tot die
 * score leiden. De aggregator weegt sub-scores tot het totaal.
 */
export interface RunnerResult {
  category: HealthCategory;
  /** 0-100, sub-score voor deze categorie. */
  score: number;
  /** Alle uitgevoerde checks, ook de geslaagde (voor de UI-lijst). */
  findings: RunnerFinding[];
}

/** Een finding zoals een runner 'm produceert, voordat ie in de DB landt. */
export type RunnerFinding = Omit<
  HealthFinding,
  'id' | 'healthScoreId' | 'restaurantId' | 'createdAt'
>;

/**
 * Context die elke runner krijgt. Bevat het restaurant + alle data
 * die de runners potentieel nodig hebben (website-URL, place_id,
 * lat/lng). Runners pakken alleen wat ze nodig hebben.
 */
export interface RunnerContext {
  restaurantId: string;
  /** Website-URL voor SEO-checks. Kan ontbreken; runner skipped dan. */
  websiteUrl: string | null;
  /** Google Place-ID; nodig voor GBP/Reviews/Competitors. */
  placeId: string | null;
  /** Locatie voor Places Nearby Search. */
  latitude: number | null;
  longitude: number | null;
  /** Naam + plaats; nodig voor GEO-prompts ("beste {keuken} in {plaats}"). */
  name: string;
  city: string | null;
  cuisineStyle: string[] | null;
}

export interface HealthRunner {
  /** Welke categorie deze runner berekent. */
  readonly category: HealthCategory;
  /** Voert alle checks uit voor één restaurant en geeft sub-score + findings terug. */
  run(ctx: RunnerContext): Promise<RunnerResult>;
}

// ============================================================
// Gewichten per categorie (totaal moet 100 zijn).
// Wijzigen? Update óók runner_version in HealthService zodat
// historische scores correct te interpreteren blijven.
// ============================================================

export const SCORE_WEIGHTS: Record<HealthCategory, number> = {
  gbp: 30,
  seo: 25,
  reviews: 25,
  geo: 20,
};

/**
 * DI-token voor het runner-array. Staat HIER (niet in health.module.ts)
 * om een circular import te voorkomen tussen module en service.
 * Beide kanten importeren 'm uit dit neutrale file.
 */
export const HEALTH_RUNNERS = Symbol('HEALTH_RUNNERS');
