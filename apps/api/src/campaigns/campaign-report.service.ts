import { BadRequestException, Injectable, Logger } from '@nestjs/common';
// Per-request user-JWT-client (RLS actief). Zie SupabaseModule voor uitleg.
import { RequestSupabaseService } from '../supabase/request-supabase.service';
import { throwDbError } from '../common/db-error';

// ============================================================
// CampaignReportService — de rapportage per uiting
// ============================================================
//
// Leest de view `campaign_performance_report` (migratie 0071): één rij per
// uiting met kanaal, organisch/betaald, bereik, doorkliks, interacties,
// boekingen, gasten, omzet, budget, kosten per boeking, ROAS en de score.
// De view doet de joins en de kanaal-resolutie, dus deze service hoeft
// alleen te filteren en op te tellen.
//
// De view is `security_invoker`, dus de RLS-policies van
// campaign_performance + campaigns gelden voor de ingelogde gebruiker.
// We scopen daarnaast expliciet op business_id: defense-in-depth, zoals
// overal in deze codebase.
//
// Aggregaties doen we in TypeScript en niet in SQL. Reden: het gaat om
// tientallen rijen per bedrijf, de frontend heeft de losse rijen tóch
// nodig voor de tabel, en zo staat de rekenkundige waarheid op één plek
// in plaats van in twee (SQL-som + JS-som die uit elkaar kunnen lopen).

/** Kanaal-labels zoals de view ze teruggeeft. */
export const REPORT_CHANNELS = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'google_business',
  'mail',
  // Historisch: bestaande rijen kunnen dit kanaal nog hebben. Niet meer
  // aan te bieden in de UI, wel te rapporteren.
  'whatsapp',
] as const;
export type ReportChannel = (typeof REPORT_CHANNELS)[number];

export type ReportKind = 'all' | 'organic' | 'paid';

export type CampaignReportRow = {
  campaign_id: string;
  campaign_name: string;
  channel: ReportChannel | string;
  status: string | null;
  happened_at: string | null;
  paid: boolean;
  reach: number | null;
  clicks: number | null;
  interactions: number | null;
  bookings: number;
  guests: number;
  revenue_cents: number;
  spend_cents: number;
  cost_per_booking_cents: number | null;
  roas: number | null;
  success_score: number | null;
  classification: 'winner' | 'average' | 'underperformer' | 'no_data' | null;
  score_basis: 'rate' | 'conversion_only' | null;
  marked_outlier: boolean;
};

export type CampaignReportTotals = {
  uitingen: number;
  paidUitingen: number;
  reach: number;
  clicks: number;
  interactions: number;
  bookings: number;
  guests: number;
  revenueCents: number;
  spendCents: number;
  /** Boekingen die aan een betaalde uiting hangen. */
  paidBookings: number;
  /** spend / paidBookings; null als er geen budget of geen boeking is. */
  costPerBookingCents: number | null;
};

export type CampaignReportChannel = CampaignReportTotals & {
  channel: ReportChannel | string;
  organicBookings: number;
  paidBookings: number;
};

export type CampaignReportBucket = {
  /** Startdatum van de bucket (ISO, YYYY-MM-DD). */
  from: string;
  bookings: number;
  uitingen: number;
};

export type CampaignReport = {
  /** De gevraagde selectie, terug-geëchood zodat de UI weet wat ze ziet. */
  filters: { days: number; kind: ReportKind; channels: string[] };
  from: string;
  to: string;
  totals: CampaignReportTotals;
  /** Vorige, even lange periode. Null als daar te weinig in zit om te vergelijken. */
  previous: { bookings: number; uitingen: number } | null;
  /**
   * Per kanaal, over de periode + soort MAAR ZONDER het kanaal-filter.
   * De per-kanaal-grafiek dimt niet-geselecteerde kanalen i.p.v. ze te
   * verbergen, anders houd je een staafdiagram met één staaf over.
   */
  byChannel: CampaignReportChannel[];
  /** Tijdreeks over de gefilterde rijen: dagen bij 7, weken daarboven. */
  buckets: CampaignReportBucket[];
  bucketSizeDays: number;
  /** Aantal per classificatie; `pending` = meet-window nog niet verstreken. */
  scores: {
    winner: number;
    average: number;
    underperformer: number;
    no_data: number;
    pending: number;
    /** Hoeveel van de gescoorde uitingen op de conversie-fallback leunen. */
    conversionOnly: number;
    scored: number;
  };
  /** De gefilterde rijen zelf, nieuwste eerst — voor de tabel. */
  rows: CampaignReportRow[];
};

const SELECT_COLS =
  'campaign_id, campaign_name, channel, status, happened_at, paid, reach, clicks, ' +
  'interactions, bookings, guests, revenue_cents, spend_cents, ' +
  'cost_per_booking_cents, roas, success_score, classification, score_basis, ' +
  'marked_outlier';

const DAY_MS = 86_400_000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class CampaignReportService {
  private readonly logger = new Logger(CampaignReportService.name);

  constructor(private readonly supabase: RequestSupabaseService) {}

  /**
   * Eén rapportage-payload voor de hele pagina. We halen de rijen van de
   * huidige periode én de vorige periode in twee queries op en rekenen de
   * rest hier uit, zodat elke kaart op de pagina gegarandeerd dezelfde
   * cijfers ziet.
   */
  async getReport(
    businessId: string,
    input: { days?: number; kind?: string; channels?: string[] },
  ): Promise<CampaignReport> {
    const days = this.parseDays(input.days);
    const kind = this.parseKind(input.kind);
    const channels = this.parseChannels(input.channels);

    const now = new Date();
    const from = new Date(now.getTime() - days * DAY_MS);
    const prevFrom = new Date(now.getTime() - days * 2 * DAY_MS);

    // Twee queries: de huidige periode en de periode ervóór. De vorige
    // hebben we alleen als totaal nodig, maar dezelfde filters moeten
    // erop, anders vergelijk je appels met peren.
    const [huidig, vorig] = await Promise.all([
      this.fetchRows(businessId, from, now, kind),
      this.fetchRows(businessId, prevFrom, from, kind),
    ]);

    // periodeRows = periode + soort, zonder kanaal-filter (voor de
    // per-kanaal-grafiek). actief = inclusief kanaal-filter.
    const actief = channels.length
      ? huidig.filter((r) => channels.includes(r.channel))
      : huidig;
    const vorigActief = channels.length
      ? vorig.filter((r) => channels.includes(r.channel))
      : vorig;

    return {
      filters: { days, kind, channels },
      from: from.toISOString(),
      to: now.toISOString(),
      totals: this.totals(actief),
      // Minder dan 2 uitingen in de vorige periode? Dan is een percentage
      // misleidend precies (63 tegen 7 is "+800%" en zegt niets). De UI
      // toont dan "te weinig historie" i.p.v. een getal.
      previous:
        vorigActief.length >= 2
          ? {
              bookings: vorigActief.reduce((s, r) => s + r.bookings, 0),
              uitingen: vorigActief.length,
            }
          : null,
      byChannel: this.byChannel(huidig),
      ...this.buckets(actief, from, days),
      scores: this.scores(actief),
      rows: actief,
    };
  }

  // ---------------- filters ----------------

  private parseDays(raw: unknown): number {
    const n = Number(raw ?? 30);
    // Vaste set: de UI biedt deze drie, en zo kan niemand een query van
    // 10 jaar afvuren.
    if (![7, 30, 90].includes(n)) {
      throw new BadRequestException('Ongeldige periode. Kies 7, 30 of 90.');
    }
    return n;
  }

  private parseKind(raw: unknown): ReportKind {
    const v = typeof raw === 'string' && raw ? raw : 'all';
    if (v !== 'all' && v !== 'organic' && v !== 'paid') {
      throw new BadRequestException(
        "Ongeldige soort. Kies 'all', 'organic' of 'paid'.",
      );
    }
    return v;
  }

  private parseChannels(raw: unknown): string[] {
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : String(raw).split(',');
    const clean = list
      .map((c) => String(c).trim())
      .filter((c) => (REPORT_CHANNELS as readonly string[]).includes(c));
    // Alles aangevinkt = geen filter; dat scheelt een onnodige IN-lijst.
    return clean.length === REPORT_CHANNELS.length
      ? []
      : Array.from(new Set(clean));
  }

  // ---------------- data ----------------

  private async fetchRows(
    businessId: string,
    from: Date,
    to: Date,
    kind: ReportKind,
  ): Promise<CampaignReportRow[]> {
    let q = this.supabase.client
      .from('campaign_performance_report')
      .select(SELECT_COLS)
      .eq('business_id', businessId)
      .gte('happened_at', from.toISOString())
      .lt('happened_at', to.toISOString())
      .order('happened_at', { ascending: false });

    if (kind === 'organic') q = q.eq('paid', false);
    if (kind === 'paid') q = q.eq('paid', true);

    const { data, error } = await q;
    if (error) throwDbError(this.logger, error);
    return (data ?? []) as unknown as CampaignReportRow[];
  }

  // ---------------- aggregaties ----------------

  private totals(rows: CampaignReportRow[]): CampaignReportTotals {
    const paidRows = rows.filter((r) => r.paid);
    const spendCents = rows.reduce((s, r) => s + (r.spend_cents ?? 0), 0);
    const paidBookings = paidRows.reduce((s, r) => s + r.bookings, 0);
    return {
      uitingen: rows.length,
      paidUitingen: paidRows.length,
      reach: rows.reduce((s, r) => s + (r.reach ?? 0), 0),
      clicks: rows.reduce((s, r) => s + (r.clicks ?? 0), 0),
      interactions: rows.reduce((s, r) => s + (r.interactions ?? 0), 0),
      bookings: rows.reduce((s, r) => s + r.bookings, 0),
      guests: rows.reduce((s, r) => s + r.guests, 0),
      revenueCents: rows.reduce((s, r) => s + r.revenue_cents, 0),
      spendCents,
      paidBookings,
      // Alleen zinvol als er zowel budget als betaalde boekingen zijn.
      costPerBookingCents:
        spendCents > 0 && paidBookings > 0
          ? Math.round(spendCents / paidBookings)
          : null,
    };
  }

  private byChannel(rows: CampaignReportRow[]): CampaignReportChannel[] {
    const perKanaal = new Map<string, CampaignReportRow[]>();
    for (const r of rows) {
      const list = perKanaal.get(r.channel) ?? [];
      list.push(r);
      perKanaal.set(r.channel, list);
    }
    return [...perKanaal.entries()]
      .map(([channel, rs]) => ({
        channel,
        ...this.totals(rs),
        organicBookings: rs
          .filter((r) => !r.paid)
          .reduce((s, r) => s + r.bookings, 0),
        paidBookings: rs
          .filter((r) => r.paid)
          .reduce((s, r) => s + r.bookings, 0),
      }))
      .sort((a, b) => b.bookings - a.bookings);
  }

  private buckets(
    rows: CampaignReportRow[],
    from: Date,
    days: number,
  ): { buckets: CampaignReportBucket[]; bucketSizeDays: number } {
    // Bij 7 dagen dag-buckets, daarboven week-buckets. Anders krijg je
    // 90 punten op een as die er 12 aankan.
    const size = days === 7 ? 1 : 7;
    const n = Math.round(days / size);
    const buckets: CampaignReportBucket[] = [];
    for (let i = 0; i < n; i++) {
      const van = new Date(from.getTime() + i * size * DAY_MS);
      const tot = new Date(van.getTime() + size * DAY_MS);
      const rs = rows.filter((r) => {
        if (!r.happened_at) return false;
        const d = new Date(r.happened_at);
        return d >= van && d < tot;
      });
      buckets.push({
        from: ymd(van),
        bookings: rs.reduce((s, r) => s + r.bookings, 0),
        uitingen: rs.length,
      });
    }
    return { buckets, bucketSizeDays: size };
  }

  private scores(rows: CampaignReportRow[]): CampaignReport['scores'] {
    const tel = (c: string) =>
      rows.filter((r) => r.classification === c).length;
    const scored = rows.filter(
      (r) => r.classification !== null && r.classification !== 'no_data',
    );
    return {
      winner: tel('winner'),
      average: tel('average'),
      underperformer: tel('underperformer'),
      no_data: tel('no_data'),
      // classification null = de nachtelijke job heeft 'm nog niet gezien,
      // dus het meet-window van 14 dagen is nog niet om.
      pending: rows.filter((r) => r.classification === null).length,
      conversionOnly: scored.filter((r) => r.score_basis === 'conversion_only')
        .length,
      scored: scored.length,
    };
  }
}
