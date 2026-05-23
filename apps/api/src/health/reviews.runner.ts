import { Injectable, Logger } from '@nestjs/common';
import { GoogleProfileService } from '../google-profile/google-profile.service';
import type { PlaceDetails } from '../google-profile/types';
import type {
  HealthRunner,
  RunnerContext,
  RunnerFinding,
  RunnerResult,
} from './types';

/**
 * ============================================================
 * ReviewsRunner — review-gezondheid (Google rating + count)
 * ============================================================
 *
 * Strategie:
 *   We hergebruiken de gecachete PlaceDetails (zelfde 24u TTL als
 *   GbpRunner) en evalueren 4 review-specifieke checks:
 *     1. Aantal reviews ≥ 10 (warning) en ≥ 30 (tip)
 *     2. Gemiddelde rating ≥ 4.0
 *     3. Heeft überhaupt reviews
 *     4. Profiel is gekoppeld
 *
 * Wat we NIET doen (nog):
 *   - Review-recency (laatste review jonger dan 60 dagen) — Places API
 *     New geeft geen review-lijst meer terug zonder OAuth. Skipped voor MVP.
 *   - Antwoord-ratio op reviews — vereist GBP API met OAuth-flow van
 *     de eigenaar. Backlog (zie [[project_getfilly]] open P1).
 *
 * Eigenaarsperspectief:
 *   "Hoe sta ik ervoor qua reviews?" → score 0-100 + concrete acties.
 *   Niet "hoeveel sterren?", wel "wat te doen om dit te verbeteren".
 * ============================================================
 */

@Injectable()
export class ReviewsRunner implements HealthRunner {
  readonly category = 'reviews' as const;
  private readonly logger = new Logger(ReviewsRunner.name);

  constructor(private readonly googleProfile: GoogleProfileService) {}

  async run(ctx: RunnerContext): Promise<RunnerResult> {
    // Geen koppeling = geen review-data; score 0, redirect naar koppeling.
    if (!ctx.placeId) {
      return {
        category: 'reviews',
        score: 0,
        findings: [
          {
            category: 'reviews',
            checkKey: 'reviews.profile_connected',
            passed: false,
            severity: 'critical',
            pointsLost: 100,
            title: 'Geen Google-koppeling, dus geen review-data',
            description:
              'We meten review-gezondheid via je Google Business Profile. Koppel eerst je profiel.',
            fixSuggestion:
              'Koppel je Google Business Profile via de GBP-hub.',
            fixLink: '/dashboard/account?tab=koppelingen',
            details: null,
          },
        ],
      };
    }

    // Place-data ophalen (cached, zelfde call als GbpRunner — Places
    // counts deze maar 1× per restaurant per 24u, dus geen extra kosten).
    const me = await this.googleProfile.getMine(ctx.restaurantId);
    if (!me.connected || !me.data) {
      this.logger.warn(
        `Reviews: Place-data ontbreekt voor restaurant ${ctx.restaurantId}`,
      );
      throw new Error('Google Place-data niet beschikbaar voor reviews-audit.');
    }

    const findings = this.evaluateChecks(me.data);

    // Sub-score
    const lost = findings
      .filter((f) => !f.passed)
      .reduce((sum, f) => sum + f.pointsLost, 0);
    const score = Math.max(0, Math.min(100, 100 - lost));

    return { category: 'reviews', score, findings };
  }

  // ============================================================
  // Checks (punten-budget som ≈ 100):
  //   reviews.has_any            — 30 pt   critical
  //   reviews.count_threshold_10 — 25 pt   high
  //   reviews.count_threshold_30 — 20 pt   medium
  //   reviews.rating_4_plus      — 25 pt   high
  // ============================================================

  private evaluateChecks(profile: PlaceDetails): RunnerFinding[] {
    const findings: RunnerFinding[] = [];
    const count = profile.userRatingCount ?? 0;
    const rating = profile.rating;

    // 1. Heeft überhaupt reviews? Nul = fataal voor vertrouwen.
    findings.push({
      category: 'reviews',
      checkKey: 'reviews.has_any',
      passed: count > 0,
      severity: 'critical',
      pointsLost: count > 0 ? 0 : 30,
      title: count > 0 ? 'Je hebt reviews' : 'Nog geen reviews',
      description:
        count > 0
          ? `${count} review${count === 1 ? '' : 's'} op je Google-profiel.`
          : 'Een profiel zonder reviews wordt door gasten gezien als "ongeprobeerd". Zelfs 5 reviews maken al een groot verschil voor het vertrouwen.',
      fixSuggestion:
        count > 0
          ? null
          : 'Vraag je eerste 5-10 tevreden gasten om een Google-review. Een QR-code op tafel of bij de bon werkt het beste.',
      fixLink: count > 0 ? null : '/dashboard/reviews',
      details: { count },
    });

    // 2. Onder 10 reviews = "nieuw/onbekend" gevoel.
    findings.push({
      category: 'reviews',
      checkKey: 'reviews.count_threshold_10',
      passed: count >= 10,
      severity: 'high',
      pointsLost: count >= 10 ? 0 : 25,
      title:
        count >= 10
          ? `${count} reviews, gezonde basis`
          : `Maar ${count} review${count === 1 ? '' : 's'} (minimaal 10)`,
      description:
        count >= 10
          ? 'Vanaf 10 reviews kantelt het vertrouwen-signaal merkbaar.'
          : 'Onder 10 reviews zien gasten je profiel als "nieuw" of "onbekend". Vanaf 10+ kantelt het vertrouwen-signaal richting positief.',
      fixSuggestion:
        count >= 10
          ? null
          : `Vraag de komende weken ${Math.max(10 - count, 1)} extra gasten om een review. Stuur 1-2 dagen na het bezoek een WhatsApp/mail met je review-link.`,
      fixLink: count >= 10 ? null : '/dashboard/reviews',
      details: { count, threshold: 10 },
    });

    // 3. Onder 30 reviews = nog niet "established"-tier.
    findings.push({
      category: 'reviews',
      checkKey: 'reviews.count_threshold_30',
      passed: count >= 30,
      severity: 'medium',
      pointsLost: count >= 30 ? 0 : 20,
      title:
        count >= 30
          ? `${count} reviews, sterke basis`
          : count >= 10
            ? `${count} reviews, doorbouwen naar 30+`
            : 'Werk eerst naar 10 reviews toe',
      description:
        count >= 30
          ? 'Vanaf 30+ reviews wordt je profiel als "gevestigd" gezien door gasten.'
          : 'Mediaan-restaurants in Nederland hebben ~50 reviews. Vanaf 30+ wordt je profiel als gevestigd gezien.',
      fixSuggestion:
        count >= 30
          ? null
          : 'Eén nieuwe review per week is een gezond ritme. Filly kan je helpen met geautomatiseerde follow-up-campagnes na elk bezoek.',
      fixLink: count >= 30 ? null : '/dashboard/campagnes',
      details: { count, threshold: 30 },
    });

    // 4. Rating ≥ 4.0. Lager = gasten scrollen door.
    // Bij <10 reviews is rating-data te volatiel om te beoordelen,
    // dan markeren we de check als 'passed' met info-severity.
    const enoughForRating = count >= 10 && rating !== null;
    const ratingOk = enoughForRating ? (rating as number) >= 4.0 : true;
    findings.push({
      category: 'reviews',
      checkKey: 'reviews.rating_4_plus',
      passed: ratingOk,
      severity: enoughForRating ? 'high' : 'info',
      pointsLost: ratingOk ? 0 : 25,
      title: !enoughForRating
        ? 'Rating nog niet betrouwbaar te meten'
        : ratingOk
          ? `Rating ${(rating as number).toFixed(1)} ⭐ — goed`
          : `Rating ${(rating as number).toFixed(1)} ⭐ — onder 4.0`,
      description: !enoughForRating
        ? 'Vanaf 10 reviews kunnen we je gemiddelde rating betrouwbaar evalueren.'
        : ratingOk
          ? 'Boven 4.0 sterren = gasten klikken vaker door op je profiel.'
          : 'Onder 4.0 sterren scrollen veel gasten door naar concurrenten. Vaak gaat het om 1-2 negatieve reviews die het gemiddelde drukken.',
      fixSuggestion:
        ratingOk || !enoughForRating
          ? null
          : 'Reageer met empathie op je laagst-beoordeelde reviews. Filly genereert antwoorden via de Reviews-pagina.',
      fixLink: ratingOk || !enoughForRating ? null : '/dashboard/reviews',
      details: { rating, count },
    });

    return findings;
  }
}
