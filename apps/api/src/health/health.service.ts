import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
// Per-request user-JWT-client: RLS is actief, defense-in-depth.
// Zelfde patroon als alle andere user-scope services (sinds 2026-05-01).
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { CompetitorCollector, type CompetitorRow } from './competitor.collector';
import {
  HEALTH_RUNNERS,
  type HealthRunner,
  type HealthSnapshotFull,
  type HealthSnapshot,
  type HealthRunSource,
  type RunnerContext,
  type RunnerResult,
  type HealthFinding,
  type HealthCompetitor,
  SCORE_WEIGHTS,
} from './types';

/**
 * ============================================================
 * HealthService — orchestrator voor de vindbaarheid-audit
 * ============================================================
 *
 * Verantwoordelijkheden (in toenemende complexiteit):
 *
 *   1. Snapshot ophalen: getLatest / getHistory.
 *   2. Run uitvoeren: roept alle runners parallel aan, aggregeert
 *      sub-scores tot een totaal, en persisteert snapshot + findings
 *      + concurrenten in 1 schrijf-flow.
 *
 * Wat dit bestand bewust NIET doet:
 *   - Geen runner-implementatie (zit per categorie in eigen file:
 *     stap 3 = SeoRunner, stap 4 = GBP/Reviews, stap 5 = Competitors,
 *     stap 6 = GEO).
 *   - Geen API-calls naar externe diensten. Dat is runner-werk.
 *
 * Falende runners: één gefaalde runner mag niet de hele audit slopen.
 * We gebruiken Promise.allSettled en geven de gefaalde categorie een
 * score van 0 met een 'critical' info-finding. Zo blijft de UI altijd
 * iets tonen en kan de gebruiker zien wat er mis ging.
 * ============================================================
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  /**
   * Versie van het score-model. Bumpen zodra we gewichten of de
   * verzameling checks structureel wijzigen, zodat historische
   * vergelijkingen kloppen.
   */
  private readonly runnerVersion = 'v1';

  constructor(
    private readonly supabase: RequestSupabaseService,
    private readonly competitorCollector: CompetitorCollector,
    // Runners worden via custom token geïnjecteerd door HealthModule.
    // Volgorde maakt niet uit, ze draaien parallel via Promise.allSettled.
    @Inject(HEALTH_RUNNERS)
    private readonly runners: HealthRunner[],
  ) {}

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Voert een nieuwe audit-run uit voor het opgegeven restaurant en
   * geeft het volledige snapshot terug (scores + findings + concurrenten).
   */
  async run(
    restaurantId: string,
    source: HealthRunSource = 'manual',
  ): Promise<HealthSnapshotFull> {
    const startedAt = Date.now();

    const ctx = await this.buildRunnerContext(restaurantId);

    // Alle runners + concurrent-collector parallel. allSettled zodat
    // één gefaalde tak de rest niet meesleurt.
    const [runnerSettled, competitorSettled] = await Promise.all([
      Promise.allSettled(this.runners.map((runner) => runner.run(ctx))),
      this.competitorCollector.collect(restaurantId).then(
        (rows) => ({ status: 'fulfilled' as const, value: rows }),
        (reason) => ({ status: 'rejected' as const, reason }),
      ),
    ]);

    const settled = runnerSettled;

    // Concurrent-collector mag falen; we loggen en gaan door met 0 rijen.
    let competitorRows: CompetitorRow[] = [];
    if (competitorSettled.status === 'fulfilled') {
      competitorRows = competitorSettled.value;
    } else {
      this.logger.warn(
        `Concurrent-collector faalde voor ${restaurantId}: ${
          competitorSettled.reason instanceof Error
            ? competitorSettled.reason.message
            : String(competitorSettled.reason)
        }`,
      );
    }

    const results: RunnerResult[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      const runner = this.runners[i];
      this.logger.error(
        `Runner ${runner.category} faalde voor restaurant ${restaurantId}: ${
          s.reason instanceof Error ? s.reason.message : String(s.reason)
        }`,
      );
      return {
        category: runner.category,
        score: 0,
        findings: [
          {
            category: runner.category,
            checkKey: `${runner.category}.runner_failed`,
            passed: false,
            severity: 'critical',
            pointsLost: 100,
            title: 'Audit kon niet worden uitgevoerd',
            description:
              'Er ging iets mis bij het meten van deze categorie. We proberen het bij de volgende run opnieuw.',
            fixSuggestion: null,
            fixLink: null,
            details: {
              error: s.reason instanceof Error ? s.reason.message : String(s.reason),
            },
          },
        ],
      };
    });

    const scoreTotal = this.aggregateTotal(results);
    const durationMs = Date.now() - startedAt;

    // Schrijven: snapshot eerst (zodat we het ID hebben), dan
    // findings + concurrenten met die FK. Volgorde is bewust, geen
    // single transaction nodig: als findings-insert faalt blijft er
    // een snapshot zonder findings, wat de UI als "leeg" toont.
    return this.persist(
      restaurantId,
      source,
      durationMs,
      results,
      scoreTotal,
      competitorRows,
    );
  }

  /**
   * Laatste snapshot inclusief findings + concurrenten.
   * Voor de hoofdpagina van /vindbaarheid.
   */
  async getLatest(restaurantId: string): Promise<HealthSnapshotFull | null> {
    const { data: snapshot, error } = await this.supabase.client
      .from('health_scores')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error(`getLatest mislukt: ${error.message}`);
      throw new Error('Kon health-score niet ophalen.');
    }
    if (!snapshot) return null;

    return this.loadFullSnapshot(this.mapSnapshot(snapshot));
  }

  /**
   * Laatste N snapshots zonder findings/concurrenten — voor de
   * trend-grafiek. Default 12 (≈ 3 maanden bij wekelijkse run).
   */
  async getHistory(restaurantId: string, limit = 12): Promise<HealthSnapshot[]> {
    const { data, error } = await this.supabase.client
      .from('health_scores')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('ran_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error(`getHistory mislukt: ${error.message}`);
      throw new Error('Kon health-historie niet ophalen.');
    }

    return (data ?? []).map((row) => this.mapSnapshot(row));
  }

  // ============================================================
  // PRIVATE: context-builder
  // ============================================================

  /**
   * Bouwt de context die alle runners krijgen. Eén query naar
   * restaurants + place_data; runners hoeven zelf niet de DB te raken
   * voor basis-info.
   */
  private async buildRunnerContext(restaurantId: string): Promise<RunnerContext> {
    const { data, error } = await this.supabase.client
      .from('restaurants')
      .select(
        'id, name, city, cuisine_style, latitude, longitude, website_url, google_place_id',
      )
      .eq('id', restaurantId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Restaurant niet gevonden of geen toegang.');
    }

    return {
      restaurantId: data.id,
      name: data.name,
      city: data.city ?? null,
      cuisineStyle: data.cuisine_style ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      websiteUrl: data.website_url ?? null,
      placeId: data.google_place_id ?? null,
    };
  }

  // ============================================================
  // PRIVATE: score-aggregatie
  // ============================================================

  /**
   * Gewogen totaal-score (0-100). Mist een runner zijn sub-score
   * (kan gebeuren bij toekomstige uitbreiding), dan herverdelen we
   * de gewichten over de overige categorieën i.p.v. een 0 mee te
   * tellen — dat zou de score onterecht omlaag trekken.
   */
  private aggregateTotal(results: RunnerResult[]): number {
    if (results.length === 0) return 0;

    const totalWeight = results.reduce(
      (sum, r) => sum + (SCORE_WEIGHTS[r.category] ?? 0),
      0,
    );
    if (totalWeight === 0) return 0;

    const weighted = results.reduce(
      (sum, r) => sum + r.score * (SCORE_WEIGHTS[r.category] ?? 0),
      0,
    );
    return Math.round(weighted / totalWeight);
  }

  /** Pakt de sub-score per categorie, met 0 als de runner ontbreekt. */
  private subScore(results: RunnerResult[], category: RunnerResult['category']): number {
    return results.find((r) => r.category === category)?.score ?? 0;
  }

  // ============================================================
  // PRIVATE: persistentie
  // ============================================================

  private async persist(
    restaurantId: string,
    source: HealthRunSource,
    durationMs: number,
    results: RunnerResult[],
    scoreTotal: number,
    competitorRows: CompetitorRow[],
  ): Promise<HealthSnapshotFull> {
    // 1) Snapshot-rij aanmaken
    const { data: snapshot, error: snapshotError } = await this.supabase.client
      .from('health_scores')
      .insert({
        restaurant_id: restaurantId,
        score_total: scoreTotal,
        score_seo: this.subScore(results, 'seo'),
        score_gbp: this.subScore(results, 'gbp'),
        score_reviews: this.subScore(results, 'reviews'),
        score_geo: this.subScore(results, 'geo'),
        run_duration_ms: durationMs,
        run_source: source,
        runner_version: this.runnerVersion,
      })
      .select('*')
      .single();

    if (snapshotError || !snapshot) {
      this.logger.error(`Snapshot insert mislukt: ${snapshotError?.message}`);
      throw new Error('Kon health-score niet opslaan.');
    }

    // 2) Findings-rijen (kan veel zijn, single bulk-insert)
    const findingRows = results.flatMap((r) =>
      r.findings.map((f) => ({
        health_score_id: snapshot.id,
        restaurant_id: restaurantId,
        category: f.category,
        check_key: f.checkKey,
        passed: f.passed,
        severity: f.severity,
        points_lost: f.pointsLost,
        title: f.title,
        description: f.description,
        fix_suggestion: f.fixSuggestion,
        fix_link: f.fixLink,
        details: f.details,
      })),
    );

    if (findingRows.length > 0) {
      const { error: findingsError } = await this.supabase.client
        .from('health_findings')
        .insert(findingRows);

      if (findingsError) {
        // Niet hard falen: snapshot staat al, UI toont 'geen findings'.
        // We loggen voor debug; volgende run lost het op.
        this.logger.error(`Findings insert mislukt: ${findingsError.message}`);
      }
    }

    // 3) Concurrent-rijen (mag leeg zijn als geen GBP-koppeling)
    if (competitorRows.length > 0) {
      const competitorInsertRows = competitorRows.map((c) => ({
        health_score_id: snapshot.id,
        restaurant_id: restaurantId,
        place_id: c.placeId,
        name: c.name,
        distance_m: c.distanceM,
        score_total: c.scoreTotal,
        score_gbp: c.scoreGbp,
        score_reviews: c.scoreReviews,
        raw_data: c.rawData,
        rank_in_radius: c.rankInRadius,
      }));

      const { error: competitorsError } = await this.supabase.client
        .from('health_competitors')
        .insert(competitorInsertRows);

      if (competitorsError) {
        // Zoals findings: niet hard falen, snapshot blijft bestaan.
        this.logger.error(
          `Competitors insert mislukt: ${competitorsError.message}`,
        );
      }
    }

    return this.loadFullSnapshot(this.mapSnapshot(snapshot));
  }

  /** Herlaadt findings + concurrenten voor een gegeven snapshot. */
  private async loadFullSnapshot(
    snapshot: HealthSnapshot,
  ): Promise<HealthSnapshotFull> {
    const [findingsRes, competitorsRes] = await Promise.all([
      this.supabase.client
        .from('health_findings')
        .select('*')
        .eq('health_score_id', snapshot.id)
        .order('points_lost', { ascending: false }),
      this.supabase.client
        .from('health_competitors')
        .select('*')
        .eq('health_score_id', snapshot.id)
        .order('rank_in_radius', { ascending: true }),
    ]);

    return {
      ...snapshot,
      findings: (findingsRes.data ?? []).map((row) => this.mapFinding(row)),
      competitors: (competitorsRes.data ?? []).map((row) => this.mapCompetitor(row)),
    };
  }

  // ============================================================
  // PRIVATE: snake_case (DB) → camelCase (TS) mappers
  // ============================================================

  private mapSnapshot(row: Record<string, unknown>): HealthSnapshot {
    return {
      id: row.id as string,
      restaurantId: row.restaurant_id as string,
      scoreTotal: row.score_total as number,
      scoreSeo: row.score_seo as number,
      scoreGbp: row.score_gbp as number,
      scoreReviews: row.score_reviews as number,
      scoreGeo: row.score_geo as number,
      ranAt: row.ran_at as string,
      runDurationMs: (row.run_duration_ms as number | null) ?? null,
      runSource: row.run_source as HealthRunSource,
      runnerVersion: row.runner_version as string,
    };
  }

  private mapFinding(row: Record<string, unknown>): HealthFinding {
    return {
      id: row.id as string,
      healthScoreId: row.health_score_id as string,
      restaurantId: row.restaurant_id as string,
      category: row.category as HealthFinding['category'],
      checkKey: row.check_key as string,
      passed: row.passed as boolean,
      severity: row.severity as HealthFinding['severity'],
      pointsLost: row.points_lost as number,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      fixSuggestion: (row.fix_suggestion as string | null) ?? null,
      fixLink: (row.fix_link as string | null) ?? null,
      details: (row.details as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  private mapCompetitor(row: Record<string, unknown>): HealthCompetitor {
    return {
      id: row.id as string,
      healthScoreId: row.health_score_id as string,
      restaurantId: row.restaurant_id as string,
      placeId: row.place_id as string,
      name: row.name as string,
      distanceM: row.distance_m as number,
      scoreTotal: (row.score_total as number | null) ?? null,
      scoreGbp: (row.score_gbp as number | null) ?? null,
      scoreReviews: (row.score_reviews as number | null) ?? null,
      rawData: (row.raw_data as Record<string, unknown> | null) ?? null,
      rankInRadius: row.rank_in_radius as number,
    };
  }
}
