import { Injectable, InternalServerErrorException } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zelfde patroon als de andere
// 13 services die per 2026-05-01 zijn gemigreerd.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import type { MailStats, CampaignMailStats } from './types';

/**
 * ============================================================
 * MarketingMailService, aggregeert mail-prestaties uit campaign_sends
 * ============================================================
 *
 * Doet GEEN nieuwe mail-verzendingen, daarvoor is MailService al
 * verantwoordelijk (sinds 2026-05-04). Deze service is read-only en
 * berekent metrics voor de Marketing-hub-pagina /dashboard/marketing/mail.
 *
 * Strategy:
 *   - Tellen via SQL count(*) filter where status = 'X', niet via
 *     full-table-scan in JS. Schaalbaar naar 1000+ klanten.
 *   - Periode standaard 30 dagen, ruim genoeg voor zinvolle trends,
 *     niet zo lang dat data muffig wordt.
 *   - Industrie-mediaan voor MVP hardcoded per cuisine-type. Bij
 *     1000+ klanten vervangen door dynamische `campaign_benchmarks`-
 *     data (die tabel bestaat sinds mig 0023).
 * ============================================================
 */
@Injectable()
export class MarketingMailService {
  constructor(private readonly supabase: RequestSupabaseService) {}

  /**
   * Aggregaat-stats voor mail over de afgelopen N dagen.
   *
   * `periodDays` default 30, sweet spot voor zichtbare trends zonder
   * te veel ruis.
   */
  async getMailStats(
    restaurantId: string,
    periodDays: number = 30,
  ): Promise<MailStats> {
    const now = new Date();
    const start = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Stap 1: alle mail-campaign-ids van dit restaurant in de periode.
    // RLS scopt automatisch op tenant via campaign_sends_access-policy
    // (zie mig 0030), maar we filteren defensief ook in de query.
    const { data: campaigns, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'mail')
      .gte('created_at', start.toISOString());

    if (campErr) throw new InternalServerErrorException(campErr.message);

    const campaignIds = (campaigns ?? []).map((c) => c.id);
    if (campaignIds.length === 0) {
      return emptyStats(restaurantId, start, now, periodDays);
    }

    // Stap 2: alle sends voor deze campagnes ophalen (alleen de
    // status-velden, geen email-adressen of inhoud). Gegroepeerd
    // tellen via JS is voor MVP prima; bij 100k+ sends per restaurant
    // vervangen door SQL-aggregate functions of materialized views.
    const { data: sends, error: sendsErr } = await this.supabase.client
      .from('campaign_sends')
      .select('status, opened_at, clicked_at, unsubscribed_at')
      .in('campaign_id', campaignIds);

    if (sendsErr) throw new InternalServerErrorException(sendsErr.message);

    const counts = countByStatus(sends ?? []);

    return {
      periodDays,
      periodStart: start.toISOString(),
      periodEnd: now.toISOString(),
      sent: counts.sent,
      delivered: counts.delivered,
      opened: counts.opened,
      clicked: counts.clicked,
      bounced: counts.bounced,
      complained: counts.complained,
      unsubscribed: counts.unsubscribed,
      openRate: ratio(counts.opened, counts.delivered),
      clickRate: ratio(counts.clicked, counts.delivered),
      bounceRate: ratio(counts.bounced, counts.sent),
      unsubscribeRate: ratio(counts.unsubscribed, counts.delivered),
      benchmark: HORECA_MAIL_BENCHMARK,
      campaignCount: campaignIds.length,
    };
  }

  /**
   * Per-campagne stats voor de tabel op de mail-detail-pagina.
   * Eigenaar kan hier zien welke campagne goed/slecht presteerde,
   * input voor toekomstige Filly-analyse ("vergelijk je beste 3").
   */
  async getCampaignMailStats(
    restaurantId: string,
    periodDays: number = 90,
  ): Promise<CampaignMailStats[]> {
    const now = new Date();
    const start = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Haal mail-campagnes op met basisdata. We doen GEEN groep-by in
    // SQL omdat dat een PostgREST-RPC zou vereisen. In-memory groepen
    // is voor 100-1000 campagnes per restaurant prima.
    const { data: campaigns, error: campErr } = await this.supabase.client
      .from('campaigns')
      .select('id, name, type, status, scheduled_for, executed_at')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'mail')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });

    if (campErr) throw new InternalServerErrorException(campErr.message);
    if (!campaigns || campaigns.length === 0) return [];

    // Sends voor al deze campagnes in 1 query, zuiniger dan N+1.
    const campaignIds = campaigns.map((c) => c.id);
    const { data: sends, error: sendsErr } = await this.supabase.client
      .from('campaign_sends')
      .select('campaign_id, status, opened_at, clicked_at, unsubscribed_at')
      .in('campaign_id', campaignIds);

    if (sendsErr) throw new InternalServerErrorException(sendsErr.message);

    // Group sends per campaign-id voor efficiënte lookup.
    const byId = new Map<string, typeof sends>();
    for (const s of sends ?? []) {
      const list = byId.get(s.campaign_id) ?? [];
      list.push(s);
      byId.set(s.campaign_id, list);
    }

    return campaigns.map((c) => {
      const cSends = byId.get(c.id) ?? [];
      const counts = countByStatus(cSends);
      return {
        campaignId: c.id,
        campaignName: c.name,
        campaignType: c.type,
        status: c.status,
        scheduledFor: c.scheduled_for,
        executedAt: c.executed_at,
        sent: counts.sent,
        delivered: counts.delivered,
        opened: counts.opened,
        clicked: counts.clicked,
        bounced: counts.bounced,
        unsubscribed: counts.unsubscribed,
        openRate: ratio(counts.opened, counts.delivered),
        clickRate: ratio(counts.clicked, counts.delivered),
      };
    });
  }
}

// ---------------- Helpers ----------------

interface SendRow {
  status: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  unsubscribed_at?: string | null;
}

interface Counts {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}

// Telt sends per status. Belangrijk: 'opened' en 'clicked' zijn
// terminale statussen, een mail die geopend is, IS ook delivered.
// Daarom tellen we delivered+opened+clicked allemaal mee in 'delivered'.
function countByStatus(sends: SendRow[]): Counts {
  const counts: Counts = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
  };
  for (const s of sends) {
    // 'sent' = alle die geprobeerd zijn te versturen (excl. queued/failed)
    if (
      s.status === 'sent' ||
      s.status === 'delivered' ||
      s.status === 'opened' ||
      s.status === 'clicked' ||
      s.status === 'bounced' ||
      s.status === 'complained'
    ) {
      counts.sent++;
    }
    // 'delivered' = aangekomen, opened/clicked tellen ook (zijn ook delivered)
    if (
      s.status === 'delivered' ||
      s.status === 'opened' ||
      s.status === 'clicked'
    ) {
      counts.delivered++;
    }
    if (s.opened_at) counts.opened++;
    if (s.clicked_at) counts.clicked++;
    if (s.unsubscribed_at) counts.unsubscribed++;
    if (s.status === 'bounced') counts.bounced++;
    if (s.status === 'complained') counts.complained++;
  }
  return counts;
}

// Veilige ratio-berekening, null bij divide-by-zero zodat we in de UI
// "—" kunnen tonen i.p.v. een misleidende 0%.
function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function emptyStats(
  _restaurantId: string,
  start: Date,
  end: Date,
  periodDays: number,
): MailStats {
  return {
    periodDays,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
    openRate: null,
    clickRate: null,
    bounceRate: null,
    unsubscribeRate: null,
    benchmark: HORECA_MAIL_BENCHMARK,
    campaignCount: 0,
  };
}

// Industrie-mediaan voor horeca-mail. Bron: Mailchimp/Campaign Monitor
// industry-reports (Restaurant & Hospitality category 2024-2025). Voor
// MVP volstaat dit; bij ≥100 actieve klanten vervangen door dynamische
// berekening uit eigen `campaign_benchmarks`-data (bestaat sinds mig 0023).
const HORECA_MAIL_BENCHMARK = {
  openRate: 0.22, // 22%, typisch goed voor restaurants
  clickRate: 0.031, // 3.1%, relatief laag want eten is meestal beslist op rate
  bounceRate: 0.018, // 1.8%, onder 2% is gezond
  source: 'Horeca-mediaan (Mailchimp 2024-2025 benchmark)',
};
