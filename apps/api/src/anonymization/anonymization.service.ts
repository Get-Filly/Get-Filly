import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// AnonymizationService
// ============================================================
// Bouwt geanonimiseerde benchmark-rijen op basis van afgeronde
// campagnes. GDPR Recital 26: alleen geaggregeerde / generieke
// velden — géén restaurant_id, géén naam/adres, géén body-tekst.
//
// Wordt aangeroepen op twee momenten:
//   1. Bij `CampaignsService.updateStatus(... → 'afgerond')` —
//      continu opbouwen, fail-soft (status-overgang faalt nooit
//      door benchmark-fout).
//   2. Bij `AccountDeletionService.deleteAccount()` — laatste
//      kans om afgeronde campagnes (die om wat voor reden niet
//      eerder zijn gebenchmarkt) alsnog te bewaren vóór de
//      restaurant-rij gecascade-delete wordt.
//
// Bewust GEEN idempotency-marker (geen FK terug naar campaign_id)
// omdat dat anonymisering ondergraaft. Dubbele rijen accepteren
// we; in de praktijk is de hook in updateStatus de primaire
// schrijver en de delete-flow zal slechts zelden overlap geven.
// ============================================================

// Eerste cijfer van NL-postcode → benaderende provincie. Bewust
// grof — voldoende voor Filly's pattern-leren ("italiaanse zaken
// in Brabant-regio") zonder herleidbaarheid (1 cijfer dekt
// duizenden adressen).
const REGION_BY_PC_FIRST_DIGIT: Record<string, string> = {
  '1': 'noord-holland',
  '2': 'zuid-holland',
  '3': 'utrecht',
  '4': 'zeeland',
  '5': 'noord-brabant',
  '6': 'limburg',
  '7': 'overijssel',
  '8': 'flevoland',
  '9': 'groningen',
};

type CapacityBucket = 'small' | 'medium' | 'large' | 'unknown';

@Injectable()
export class AnonymizationService {
  private readonly logger = new Logger(AnonymizationService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Bouwt 1 benchmark-rij voor een specifieke campagne. Returnt
  // true als geslaagd, false als niet (caller mag dat negeren).
  async benchmarkCampaign(campaignId: string): Promise<boolean> {
    try {
      // 1. Campagne-meta (alleen meta, geen body-tekst).
      const { data: campaign, error: campErr } = await this.supabase.client
        .from('campaigns')
        .select(
          'id, restaurant_id, type, tags, executed_at, created_at, result_stats',
        )
        .eq('id', campaignId)
        .maybeSingle();

      if (campErr) throw new Error(campErr.message);
      if (!campaign) return false;

      // 2. Restaurant-archetype.
      const { data: restaurant, error: restErr } = await this.supabase.client
        .from('restaurants')
        .select(
          'type, cuisine_style, postal_code, capacity_seats, price_range, brand_tone, has_terrace, has_kids_menu',
        )
        .eq('id', campaign.restaurant_id)
        .maybeSingle();

      if (restErr) throw new Error(restErr.message);
      if (!restaurant) return false;

      // 3. Has-media-signaal: alleen relevant voor social/whatsapp,
      //    mail-campagnes hebben dat veld niet (header-image is later
      //    werk volgens 0015). Aparte mini-query houdt de hoofd-call
      //    schoon en voorkomt RLS-/join-edge-cases.
      const hasMedia = await this.detectHasMedia(
        campaignId,
        campaign.type as string,
      );

      // Datum waarop de campagne is uitgevoerd (executed_at) of
      // anders aangemaakt (created_at). We gebruiken alleen
      // maand + weekdag — niet de exacte datum.
      const sentAt = new Date(
        (campaign.executed_at as string | null) ??
          (campaign.created_at as string),
      );

      const benchmarkRow = {
        // Restaurant-archetype
        restaurant_type: (restaurant.type as string | null) ?? null,
        cuisine_style:
          (restaurant.cuisine_style as string[] | null) ?? null,
        region: this.postcodeToRegion(
          restaurant.postal_code as string | null,
        ),
        capacity_bucket: this.capacitySeatsToBucket(
          restaurant.capacity_seats as number | null,
        ),
        price_range: (restaurant.price_range as number | null) ?? null,
        brand_tone: (restaurant.brand_tone as string | null) ?? null,
        has_terrace: (restaurant.has_terrace as boolean | null) ?? null,
        has_kids_menu:
          (restaurant.has_kids_menu as boolean | null) ?? null,
        // Campagne-archetype
        campaign_type: campaign.type as string,
        theme_tags: (campaign.tags as string[] | null) ?? [],
        has_media: hasMedia,
        month_of_year: sentAt.getUTCMonth() + 1, // 1-12
        weekday_of_send: sentAt.getUTCDay(), // 0-6 (0 = zondag)
        // Resultaat-signaal (kan {} zijn als nog niet gemeten)
        success_metrics:
          (campaign.result_stats as Record<string, unknown> | null) ?? {},
      };

      const { error: insErr } = await this.supabase.client
        .from('campaign_benchmarks')
        .insert(benchmarkRow);

      if (insErr) throw new Error(insErr.message);

      return true;
    } catch (err) {
      // Fail-soft: een falende benchmark mag de status-overgang
      // of het delete-verzoek nooit blokkeren. Loggen is genoeg.
      this.logger.warn(
        `benchmarkCampaign(${campaignId}) faalde: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  // Batch-variant: alle 'afgerond'-campagnes van een restaurant
  // benchmarken. Wordt vóór de account-delete aangeroepen om
  // zeker te weten dat we niets verliezen wat eerder gemist is.
  // Returnt het aantal succesvol geschreven rijen.
  async benchmarkAllCompletedFor(restaurantId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('campaigns')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'afgerond');

    if (error || !data) {
      this.logger.warn(
        `benchmarkAllCompletedFor(${restaurantId}) listing faalde: ${
          error?.message ?? 'unknown'
        }`,
      );
      return 0;
    }

    let count = 0;
    for (const row of data) {
      const ok = await this.benchmarkCampaign(row.id as string);
      if (ok) count++;
    }
    return count;
  }

  // -------- helpers --------

  private postcodeToRegion(pc: string | null): string | null {
    if (!pc) return null;
    const first = pc.trim().charAt(0);
    return REGION_BY_PC_FIRST_DIGIT[first] ?? null;
  }

  private capacitySeatsToBucket(seats: number | null): CapacityBucket {
    if (seats == null) return 'unknown';
    if (seats < 30) return 'small';
    if (seats < 80) return 'medium';
    return 'large';
  }

  // Detecteert of er een foto bij de campagne hangt. Per type:
  //   - social   → campaign_social_content.media_urls (array)
  //   - whatsapp → campaign_whatsapp_content.media_url (string)
  //   - mail     → niet ondersteund (header-image is later werk)
  private async detectHasMedia(
    campaignId: string,
    type: string,
  ): Promise<boolean> {
    if (type === 'social') {
      const { data } = await this.supabase.client
        .from('campaign_social_content')
        .select('media_urls')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      const urls = (data?.media_urls as string[] | null) ?? [];
      return urls.length > 0;
    }
    if (type === 'whatsapp') {
      const { data } = await this.supabase.client
        .from('campaign_whatsapp_content')
        .select('media_url')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      return Boolean(data?.media_url);
    }
    return false;
  }
}
