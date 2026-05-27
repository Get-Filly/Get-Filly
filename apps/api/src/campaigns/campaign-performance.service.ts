import { Injectable, Logger } from '@nestjs/common';
// Per-request user-JWT-client voor RLS-active reads/writes.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
// Service-role-client voor webhook-handlers en nightly-jobs die
// buiten user-context draaien.
import { SupabaseService } from '../supabase/supabase.service';
import { SUCCESS_SCORE_THRESHOLDS } from '../ai/filly-brain.config';

/**
 * ============================================================
 * CampaignPerformanceService — meten wat werkt en wat niet
 * ============================================================
 *
 * Verantwoordelijkheden (uit filly-brein hoofdstuk 9):
 *   1. Een rij aanmaken in `campaign_performance` zodra een campagne
 *      de status `actief` of `afgerond` bereikt (caller: campaigns-flow).
 *   2. Webhook-events (mail/social/whatsapp/gbp) verwerken en de
 *      bijbehorende kolommen incrementen.
 *   3. Reservation-attributie hooks: zodra een reservering met
 *      via_campaign_id wordt aangemaakt, increment reservations_attributed
 *      en revenue_attributed_cents.
 *   4. Nightly job: scan campagnes waarvan meet-window verstreken is en
 *      bereken success_score + classification.
 *   5. UI-reads: snapshot per campagne + per-restaurant-trend.
 *
 * Welke client gebruikt deze service waar?
 *   - User-getriggerde reads (UI-card / detail-page) → RequestSupabaseService.
 *   - Webhooks van Resend/Meta/Twilio (geen user-context) → SupabaseService.
 *   - Nightly job draait in cron-process zonder user → SupabaseService.
 *
 * Dit is v1: data-collectie en classification. Filly's gebruik in
 * prompts (top-3 winners / underperformers) volgt in een vervolgstap.
 * ============================================================
 */

/** Schaal-factoren per kanaal voor de gewogen succes-score-berekening. */
interface ChannelWeights {
  // Mail: opens × 0.3 + clicks × 0.5 + reservations × 0.2 (last is hoogste signaal)
  // Maar: alles ge-normaliseerd naar % van mail_delivered.
  // Voor v1 houden we het simpel: open_rate + click_rate * 2 + reservations_per_send * 10
  // → max ~100 bij realistische horeca-percentages.
}

export interface PerformanceUpsertInput {
  campaignId: string;
  restaurantId: string;
}

export interface PerformanceIncrementInput {
  campaignId: string;
  /** Welk veld te incrementen (snake_case key uit de tabel). */
  field:
    | 'mail_delivered'
    | 'mail_opened'
    | 'mail_clicked'
    | 'mail_bounced'
    | 'mail_unsubscribed'
    | 'social_reach'
    | 'social_impressions'
    | 'social_engagement'
    | 'social_saves'
    | 'social_video_views'
    | 'social_watch_time_seconds'
    | 'whatsapp_delivered'
    | 'whatsapp_read'
    | 'whatsapp_clicked'
    | 'gbp_impressions'
    | 'gbp_clicks'
    | 'gbp_calls'
    | 'gbp_directions';
  /** Hoeveel te incrementen (default 1). */
  delta?: number;
}

export interface AttributedReservationInput {
  campaignId: string;
  partySize: number;
  /** Geschatte revenue per gast in centen (uit restaurants.avg_check_cents). */
  avgCheckCents: number;
}

@Injectable()
export class CampaignPerformanceService {
  private readonly logger = new Logger(CampaignPerformanceService.name);

  constructor(
    private readonly requestSupabase: RequestSupabaseService,
    private readonly serviceSupabase: SupabaseService,
  ) {}

  // ============================================================
  // 1. Initialiseren — wordt aangeroepen wanneer een campagne live gaat
  // ============================================================

  /**
   * Maak (idempotent) een performance-rij voor deze campagne. Wordt
   * aangeroepen door CampaignsService bij status→'actief'-transitie.
   * Gebruikt service-role omdat de caller mogelijk geen user-context
   * heeft (bv. pg_cron auto-activate).
   */
  async ensureRow(input: PerformanceUpsertInput): Promise<void> {
    const { error } = await this.serviceSupabase.client
      .from('campaign_performance')
      .upsert(
        {
          campaign_id: input.campaignId,
          restaurant_id: input.restaurantId,
        },
        { onConflict: 'campaign_id', ignoreDuplicates: true },
      );
    if (error) {
      this.logger.error(
        `ensureRow campaign_performance gefaald voor ${input.campaignId}: ${error.message}`,
      );
    }
  }

  // ============================================================
  // 2. Webhook-handlers: increment-of-a-field
  // ============================================================

  /**
   * Incrementeer één kolom. Gebruik vanuit Resend-webhook (mail-events),
   * Meta-webhooks (social-events) etc. Service-role client want webhooks
   * komen binnen zonder user-context.
   */
  async incrementField(input: PerformanceIncrementInput): Promise<void> {
    const delta = input.delta ?? 1;

    // Lees huidig, increment, schrijf terug. Geen RPC (zou cleaner zijn
    // maar vereist een Postgres-functie). Voor v1 acceptabel; bij hoge
    // throughput migreren naar RPC met atomic increment.
    const { data: row, error: readErr } = await this.serviceSupabase.client
      .from('campaign_performance')
      .select(`id, ${input.field}`)
      .eq('campaign_id', input.campaignId)
      .maybeSingle();

    if (readErr) {
      this.logger.warn(
        `incrementField read gefaald (${input.field}): ${readErr.message}`,
      );
      return;
    }
    if (!row) {
      // Geen rij voor deze campagne — Resend-webhook kwam binnen vóór
      // status→actief. We loggen, maar slaan niets op. Zou kunnen
      // betekenen dat ensureRow() niet werd aangeroepen.
      this.logger.warn(
        `incrementField: geen performance-rij voor campaign ${input.campaignId}, skip ${input.field}.`,
      );
      return;
    }

    const current = (row as Record<string, number | null>)[input.field] ?? 0;
    const next = current + delta;

    const { error: writeErr } = await this.serviceSupabase.client
      .from('campaign_performance')
      .update({ [input.field]: next })
      .eq('campaign_id', input.campaignId);

    if (writeErr) {
      this.logger.error(
        `incrementField write gefaald (${input.field}): ${writeErr.message}`,
      );
    }
  }

  // ============================================================
  // 3. Reservation-attributie
  // ============================================================

  /**
   * Wordt aangeroepen wanneer een reservering met via_campaign_id
   * wordt aangemaakt of bijgewerkt. Increment reservations + guests +
   * revenue cumulatief.
   */
  async attributeReservation(
    input: AttributedReservationInput,
  ): Promise<void> {
    const revenue = input.partySize * input.avgCheckCents;

    // Atomic-ish read+write zoals incrementField. Voor v1 simpel.
    const { data: row, error: readErr } = await this.serviceSupabase.client
      .from('campaign_performance')
      .select(
        'id, reservations_attributed, guests_attributed, revenue_attributed_cents',
      )
      .eq('campaign_id', input.campaignId)
      .maybeSingle();

    if (readErr || !row) {
      this.logger.warn(
        `attributeReservation: geen performance-rij voor ${input.campaignId}, skip.`,
      );
      return;
    }

    const r = row as {
      reservations_attributed: number;
      guests_attributed: number;
      revenue_attributed_cents: number;
    };

    const { error: writeErr } = await this.serviceSupabase.client
      .from('campaign_performance')
      .update({
        reservations_attributed: r.reservations_attributed + 1,
        guests_attributed: r.guests_attributed + input.partySize,
        revenue_attributed_cents: r.revenue_attributed_cents + revenue,
      })
      .eq('campaign_id', input.campaignId);

    if (writeErr) {
      this.logger.error(
        `attributeReservation write gefaald: ${writeErr.message}`,
      );
    }
  }

  // ============================================================
  // 4. Success-classification (nightly job, hoofdstuk 9.4)
  // ============================================================

  /**
   * Classificeer een campagne: winner / average / underperformer /
   * no_data.
   *
   * ⚠️ LET OP — dit is NIET het actieve classificatie-pad. De nightly
   * classificatie draait in de PL/pgSQL-functie
   * `classify_campaign_performance()` (mig 0047 → 0050), aangeroepen
   * door pg_cron. Die classificeert mail t.o.v. een afgeleide
   * industry-baseline (53): winner >= 69, underperformer <= 37.
   * Deze TS-helper gebruikt nog de oude absolute 80/50-drempels en
   * wordt momenteel nergens aangeroepen; behouden als referentie voor
   * een eventueel toekomstig on-demand-endpoint. Wijzig je de scoring,
   * doe dat primair in de SQL-functie.
   *
   * Per-restaurant-benchmark (shrinkage) staat op de backlog.
   *
   * Score-formule (identiek aan SQL): open_rate*100 (cap 30) +
   * click_rate*1000 (cap 50) + reservation_rate*1000 (cap 20).
   */
  classifySuccessScore(metrics: {
    mail_delivered?: number | null;
    mail_opened?: number | null;
    mail_clicked?: number | null;
    reservations_attributed: number;
  }): { score: number | null; classification: string } {
    const delivered = metrics.mail_delivered ?? 0;

    if (delivered === 0) {
      // Geen mail-data. Voor social/GBP zou hier de berekening per
      // kanaal komen; tot OAuth live is, no_data.
      return { score: null, classification: 'no_data' };
    }

    const openRate = (metrics.mail_opened ?? 0) / delivered;
    const clickRate = (metrics.mail_clicked ?? 0) / delivered;
    const reservationRate = metrics.reservations_attributed / delivered;

    // Gewogen score. Mail-benchmarks (HubSpot 2024):
    //   open_rate >= 30% = sterk → 30% van 30 pts = 9 pts (lineair)
    //   click_rate >= 4% = sterk → 4% van 50 pts schalen
    //   reservation_rate >= 2% = sterk → 2% van 20 pts schalen
    // We clampen zodat outliers niet >100 worden.
    const openPts = Math.min(30, openRate * 100); // 30% open → 30 pts
    const clickPts = Math.min(50, clickRate * 1000); // 5% click → 50 pts
    const reservationPts = Math.min(20, reservationRate * 1000); // 2% conv → 20 pts

    const score = Math.round(openPts + clickPts + reservationPts);

    let classification: string;
    if (score >= SUCCESS_SCORE_THRESHOLDS.winner) {
      classification = 'winner';
    } else if (score >= SUCCESS_SCORE_THRESHOLDS.average) {
      classification = 'average';
    } else if (score >= SUCCESS_SCORE_THRESHOLDS.underperformer) {
      classification = 'underperformer';
    } else {
      classification = 'underperformer';
    }

    return { score, classification };
  }

  /**
   * Nightly-job-helper: scan campagnes waar measurement_complete_at
   * verstreken is (of net moet worden gezet), bereken score + classification.
   * Aanroep vanuit pg_cron of een Nest-scheduler (later toevoegen).
   */
  async runNightlyClassification(): Promise<{ processed: number }> {
    // V1: scan campagnes ouder dan 14 dagen waarvoor classification
    // nog null is. In v2 differentiëren we per kanaal-meet-window.
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: rows, error } = await this.serviceSupabase.client
      .from('campaign_performance')
      .select(
        'id, campaign_id, mail_delivered, mail_opened, mail_clicked, reservations_attributed',
      )
      .is('classification', null)
      .lt('created_at', fourteenDaysAgo)
      .limit(100); // batches van 100; cron pakt morgen de rest

    if (error) {
      this.logger.error(`Nightly classification read: ${error.message}`);
      return { processed: 0 };
    }

    let processed = 0;
    for (const row of rows ?? []) {
      const r = row as {
        id: string;
        campaign_id: string;
        mail_delivered: number | null;
        mail_opened: number | null;
        mail_clicked: number | null;
        reservations_attributed: number;
      };
      const { score, classification } = this.classifySuccessScore(r);
      const { error: updateErr } = await this.serviceSupabase.client
        .from('campaign_performance')
        .update({
          success_score: score,
          classification,
          measurement_complete_at: new Date().toISOString(),
        })
        .eq('id', r.id);
      if (updateErr) {
        this.logger.error(
          `Nightly classification update ${r.id}: ${updateErr.message}`,
        );
        continue;
      }
      processed += 1;
    }
    return { processed };
  }

  // ============================================================
  // 5. UI-reads (user-context, RLS-active)
  // ============================================================

  /** Performance van één specifieke campagne voor de detail-page. */
  async getForCampaign(campaignId: string): Promise<unknown | null> {
    const { data, error } = await this.requestSupabase.client
      .from('campaign_performance')
      .select('*')
      .eq('campaign_id', campaignId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`getForCampaign: ${error.message}`);
      return null;
    }
    return data ?? null;
  }

  /**
   * Top-N winners voor dit restaurant + kanaal — door Filly-prompt
   * geconsumeerd als "SUCCESSFUL PATTERNS" (zie filly-brein hfst 9.5).
   * Vereist later de fingerprint-tabel (hfst 8) om patronen te
   * extraheren; v1 retourneert alleen campaign_id-lijst.
   */
  async getTopWinners(
    restaurantId: string,
    limitN: number = 3,
  ): Promise<string[]> {
    const { data, error } = await this.requestSupabase.client
      .from('campaign_performance')
      .select('campaign_id, success_score')
      .eq('restaurant_id', restaurantId)
      .eq('classification', 'winner')
      .eq('marked_outlier', false)
      .order('success_score', { ascending: false })
      .limit(limitN);

    if (error) {
      this.logger.warn(`getTopWinners: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => (r as { campaign_id: string }).campaign_id);
  }

  /**
   * Markeer een campagne als outlier (filly-brein hfst 9.7). De rij
   * blijft zichtbaar in de UI maar valt uit Filly's leerloop. Gebruikt
   * door eigenaar wanneer de campagne in een atypische context viel
   * (slecht weer, staking, etc.).
   */
  async markOutlier(
    campaignId: string,
    userId: string,
    reason: string | null,
  ): Promise<{ ok: true }> {
    const { error } = await this.requestSupabase.client
      .from('campaign_performance')
      .update({
        marked_outlier: true,
        marked_outlier_reason: reason,
        marked_outlier_at: new Date().toISOString(),
        marked_outlier_by_user: userId,
      })
      .eq('campaign_id', campaignId);
    if (error) {
      this.logger.warn(`markOutlier: ${error.message}`);
      throw new Error('Kon outlier-status niet opslaan.');
    }
    return { ok: true };
  }

  /** Herroep outlier-markering, neem campagne weer mee in leerloop. */
  async unmarkOutlier(campaignId: string): Promise<{ ok: true }> {
    const { error } = await this.requestSupabase.client
      .from('campaign_performance')
      .update({
        marked_outlier: false,
        marked_outlier_reason: null,
        marked_outlier_at: null,
        marked_outlier_by_user: null,
      })
      .eq('campaign_id', campaignId);
    if (error) {
      this.logger.warn(`unmarkOutlier: ${error.message}`);
      throw new Error('Kon outlier-status niet herroepen.');
    }
    return { ok: true };
  }

  async getTopUnderperformers(
    restaurantId: string,
    limitN: number = 3,
  ): Promise<string[]> {
    const { data, error } = await this.requestSupabase.client
      .from('campaign_performance')
      .select('campaign_id, success_score')
      .eq('restaurant_id', restaurantId)
      .eq('classification', 'underperformer')
      .eq('marked_outlier', false)
      .order('success_score', { ascending: true })
      .limit(limitN);

    if (error) {
      this.logger.warn(`getTopUnderperformers: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => (r as { campaign_id: string }).campaign_id);
  }
}
