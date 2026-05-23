import { Injectable, Logger } from '@nestjs/common';
import { GoogleProfileService } from '../google-profile/google-profile.service';
import type { NearbyPlace } from '../google-profile/types';

/**
 * ============================================================
 * CompetitorCollector — top-5 concurrenten in 500m straal
 * ============================================================
 *
 * BEWUST GEEN HealthRunner:
 *   Concurrent-vergelijking is geen audit-categorie met sub-score; het
 *   is contextuele info die naast de eigen scores wordt getoond. We
 *   houden hem dus buiten het runner-mechanisme van HealthService.
 *
 * Data-bron:
 *   GoogleProfileService.getCompetitors() doet de Places-Nearby-Search
 *   met restaurant-filter en berekent afstand via haversine. Geen
 *   extra Places-call boven de bestaande GBP-hub-feature.
 *
 * Per-concurrent scoring:
 *   We rekenen GEEN volledige health-audit voor concurrenten (zou de
 *   Places-quota × 5 maken). In plaats daarvan:
 *     - score_reviews via lichte heuristiek (count + rating)
 *     - score_gbp via foto-volume + aanwezigheid kerninfo
 *     - score_total = gewogen gemiddelde van die twee
 *   Goed genoeg voor een vergelijkings-tabel; klant wil zien
 *   "wie is sterker" niet "exacte sub-scores".
 *
 * Geen GBP-koppeling = geen vergelijking mogelijk.
 *   We swallow-en de NotFoundException van GoogleProfileService en
 *   returnen een lege array. HealthService schrijft dan gewoon 0
 *   concurrent-rijen; de UI toont een "Koppel GBP om concurrenten te
 *   zien"-state.
 * ============================================================
 */

/** Straal in meters waarin we concurrenten zoeken. 500m = "directe buurt". */
const RADIUS_METERS = 500;

/** Maximum concurrenten dat we opslaan. UI toont top-5; we slaan top-10 op voor toekomstige "top-20"-tab. */
const MAX_COMPETITORS = 10;

/** Shape die HealthService gebruikt om health_competitors-rijen te insertten. */
export interface CompetitorRow {
  placeId: string;
  name: string;
  distanceM: number;
  scoreTotal: number | null;
  scoreGbp: number | null;
  scoreReviews: number | null;
  rawData: Record<string, unknown>;
  rankInRadius: number;
}

@Injectable()
export class CompetitorCollector {
  private readonly logger = new Logger(CompetitorCollector.name);

  constructor(private readonly googleProfile: GoogleProfileService) {}

  /**
   * Verzamelt + scoort de buurt-concurrenten. Returnt een (mogelijk
   * lege) lijst rijen klaar voor insert in health_competitors.
   */
  async collect(restaurantId: string): Promise<CompetitorRow[]> {
    let nearby: NearbyPlace[];
    try {
      nearby = await this.googleProfile.getCompetitors(restaurantId, RADIUS_METERS);
    } catch (err) {
      // NotFoundException = geen GBP-koppeling = normale staat, geen failure
      this.logger.log(
        `Geen concurrenten ophaalbaar voor ${restaurantId} (${
          err instanceof Error ? err.message : err
        })`,
      );
      return [];
    }

    // Sorteer op een combinatie van rating × log(count) zodat sterk
    // beoordeelde concurrenten boven aan komen, niet de dichtstbijzijnde
    // toko met 2 reviews van 1 ster. Dichtbij + populair = relevantste.
    const scored = nearby
      .filter((p) => p.distanceMeters !== null && p.distanceMeters <= RADIUS_METERS)
      .map((p) => ({
        place: p,
        scoreReviews: this.scoreReviews(p.rating, p.userRatingCount),
        scoreGbp: this.scoreGbp(p.photoCount, p.formattedAddress, p.primaryType),
      }))
      .map((c) => ({
        ...c,
        scoreTotal: Math.round((c.scoreReviews + c.scoreGbp) / 2),
      }));

    // Top-N op totaal-score (sterkste concurrenten eerst).
    scored.sort((a, b) => b.scoreTotal - a.scoreTotal);
    const top = scored.slice(0, MAX_COMPETITORS);

    return top.map((c, idx) => ({
      placeId: c.place.placeId,
      name: c.place.displayName,
      // distanceMeters is hier altijd gezet door de filter hierboven.
      distanceM: Math.round(c.place.distanceMeters ?? 0),
      scoreTotal: c.scoreTotal,
      scoreGbp: c.scoreGbp,
      scoreReviews: c.scoreReviews,
      rawData: {
        rating: c.place.rating,
        userRatingCount: c.place.userRatingCount,
        formattedAddress: c.place.formattedAddress,
        primaryType: c.place.primaryType,
        photoCount: c.place.photoCount,
      },
      rankInRadius: idx + 1, // 1 = sterkste concurrent
    }));
  }

  // ============================================================
  // Heuristieken (zelfde tier als ReviewsRunner/GbpRunner voor
  // visuele consistentie in de UI, maar dan lichter berekend).
  // ============================================================

  /**
   * Reviews-score 0-100 op basis van count + rating.
   *
   * Wegen we via een tiered systeem:
   *   - heeft reviews                      → +25
   *   - count ≥ 10                         → +25
   *   - count ≥ 30                         → +20
   *   - rating ≥ 4.0 (vereist ≥10 reviews) → +30
   *
   * Maximum dus 100, minimum 0.
   */
  private scoreReviews(rating: number | null, count: number | null): number {
    const c = count ?? 0;
    let score = 0;
    if (c > 0) score += 25;
    if (c >= 10) score += 25;
    if (c >= 30) score += 20;
    if (c >= 10 && rating !== null && rating >= 4.0) score += 30;
    return Math.min(score, 100);
  }

  /**
   * GBP-kwaliteit 0-100 op lichte signalen. Voor concurrenten hebben
   * we GEEN volledige Place-details (zou extra API-call kosten),
   * alleen wat in Nearby-Search-response zit:
   *   - foto-aantal (uit photos-array)
   *   - aanwezigheid adres (sanity-check)
   *   - aanwezigheid primaryType
   *
   * Heuristiek:
   *   - photos ≥ 5                        → +40
   *   - photos ≥ 10                       → +30 (cumulatief 70)
   *   - heeft adres                       → +15
   *   - heeft primaryType (niet generiek) → +15
   */
  private scoreGbp(
    photoCount: number,
    address: string | null,
    primaryType: string | null,
  ): number {
    let score = 0;
    if (photoCount >= 5) score += 40;
    if (photoCount >= 10) score += 30;
    if (address && address !== '—') score += 15;
    if (
      primaryType &&
      primaryType !== 'establishment' &&
      primaryType !== 'point_of_interest'
    ) {
      score += 15;
    }
    return Math.min(score, 100);
  }
}
