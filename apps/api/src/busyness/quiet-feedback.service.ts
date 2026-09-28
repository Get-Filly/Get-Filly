import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  DAYPART_DEFS,
  FEEDBACK_MIN_SAMPLES,
  type SlotPerformance,
} from './quiet-signals';

// ============================================================
// QuietFeedbackService — deed de campagne iets met de drukte? (fase 4)
// ============================================================
//
// De leerloop van de rustige-momenten-detectie. Het project meet al hoe een
// UITING het deed (campaign_performance, mig 0071: open-rate, doorkliks,
// boekingen). Dit meet iets anders: werd het MOMENT waarvoor de campagne
// bedoeld was ook echt voller? Dat is de vraag die bepaalt welke slots de
// detectie voortaan moet voorstellen.
//
// Let op: de briefing ging ervan uit dat deze definitie al in het project
// bestond. Dat klopte niet — campaign_performance scoort kanaal-metrics, niet
// drukte. Dit is dus nieuwe meetcode, geen aansluiting op iets bestaands.
//
// Meetdefinitie:
//   actual   = gemeten drukte in het doel-dagdeel op de doeldatum (mediaan
//              van live_pct per uur, daarna gemiddeld over de uren)
//   baseline = mediaan van diezelfde maat over vergelijkbare dagen: zelfde
//              weekdag, zelfde dagdeel, binnen het venster, zonder campagne
//   lift     = actual − baseline, in drukte-punten
//
// Wat dit NIET is: een experiment. Er is geen controlegroep, dus weer, een
// evenement of een feestdag op de doeldatum tellen mee in de "lift". Daarom
// werkt de weging op de MEDIAAN over meerdere campagnes per slot en pas
// vanaf een minimum aantal metingen — één festival mag het beeld niet
// bepalen. En daarom is de uitslag op de score klein gehouden.

// Hoe ver terug we campagnes ophalen om te meten. Ruimer dan de 120 dagen
// retentie van busyness_snapshots heeft geen zin: dan is de ruwe meting weg.
const MEASURE_LOOKBACK_DAYS = 100;
// Een campagne pas meten als de dag echt voorbij is én de live-cron z'n werk
// heeft kunnen doen.
const MEASURE_MIN_AGE_DAYS = 2;
// Minimum aantal vergelijkbare dagen voor een bruikbare baseline.
const MIN_BASELINE_DAYS = 3;
// Minimum aantal gemeten uren binnen het dagdeel op de doeldatum.
const MIN_MEASURED_HOURS = 2;

type TargetedCampaign = {
  campaignId: string;
  businessId: string;
  targetDate: string;
  daypart: string;
};

export type MeasureResult = {
  scanned: number;
  measured: number;
  skipped: number;
};

@Injectable()
export class QuietFeedbackService {
  private readonly logger = new Logger(QuietFeedbackService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // ============================================================
  // Meten
  // ============================================================

  /**
   * Meet alle campagnes met een doelmoment dat voorbij is en nog geen meting
   * heeft. Idempotent: een campagne krijgt één rij (unique op campaign_id) en
   * een mislukte meting legt óók een rij vast, zodat de cron 'm niet elke
   * nacht opnieuw probeert.
   *
   * Fail-soft per zaak: één kapotte meting blokkeert de rest niet.
   */
  async measurePending(): Promise<MeasureResult> {
    const todo = await this.findUnmeasured();
    let measured = 0;
    let skipped = 0;

    // Per zaak groeperen: de live-metingen halen we in één query per zaak op.
    const byBusiness = new Map<string, TargetedCampaign[]>();
    for (const c of todo) {
      const arr = byBusiness.get(c.businessId);
      if (arr) arr.push(c);
      else byBusiness.set(c.businessId, [c]);
    }

    for (const [businessId, campaigns] of byBusiness) {
      try {
        const done = await this.measureForBusiness(businessId, campaigns);
        measured += done;
        skipped += campaigns.length - done;
      } catch (e) {
        this.logger.warn(`meting faalde voor ${businessId}: ${String(e)}`);
        skipped += campaigns.length;
      }
    }

    this.logger.log(
      `quiet-effect: ${todo.length} campagnes bekeken, ${measured} gemeten, ${skipped} zonder uitkomst.`,
    );
    return { scanned: todo.length, measured, skipped };
  }

  /**
   * Campagnes met een doelmoment in het meetvenster die nog geen rij in
   * campaign_quiet_effect hebben.
   *
   * Het doelmoment staat NIET op de campagne zelf: `campaigns.scheduled_for`
   * is het verzendmoment (een mail gaat om 10:00 de deur uit voor een diner
   * om 19:00). Het echte doel staat in ai_suggestions.trigger_context
   * (target_date + target_daypart) en hangt aan de campagne via
   * ai_suggestion_id. Campagnes zonder die koppeling kunnen we dus niet
   * meten; dat is een bekende beperking en geen fout.
   */
  private async findUnmeasured(): Promise<TargetedCampaign[]> {
    const today = new Date();
    const oldest = new Date(today);
    oldest.setUTCDate(oldest.getUTCDate() - MEASURE_LOOKBACK_DAYS);
    const newest = new Date(today);
    newest.setUTCDate(newest.getUTCDate() - MEASURE_MIN_AGE_DAYS);
    const oldestIso = oldest.toISOString().slice(0, 10);
    const newestIso = newest.toISOString().slice(0, 10);

    // Ruime ondergrens op created_at zodat de query niet elke campagne ooit
    // ophaalt: een campagne die een dag in het venster als doel had, is
    // daarvóór aangemaakt. De echte filtering op doeldatum gebeurt hieronder,
    // want die datum staat in het gekoppelde voorstel en niet op de campagne.
    const createdSince = new Date(today);
    createdSince.setUTCDate(
      createdSince.getUTCDate() - MEASURE_LOOKBACK_DAYS - 60,
    );

    const { data: campaigns, error } = await this.supabase.client
      .from('campaigns')
      .select('id, business_id, ai_suggestion_id, status')
      .not('ai_suggestion_id', 'is', null)
      .neq('status', 'concept')
      .neq('status', 'gearchiveerd')
      .gte('created_at', createdSince.toISOString());
    if (error) {
      this.logger.warn(`campagne-query faalde: ${error.message}`);
      return [];
    }
    const rows = (campaigns ?? []) as Array<{
      id: string;
      business_id: string;
      ai_suggestion_id: string;
    }>;
    if (rows.length === 0) return [];

    // Al gemeten campagnes eruit.
    const { data: done } = await this.supabase.client
      .from('campaign_quiet_effect')
      .select('campaign_id');
    const alreadyMeasured = new Set(
      ((done ?? []) as Array<{ campaign_id: string }>).map(
        (d) => d.campaign_id,
      ),
    );

    const pending = rows.filter((r) => !alreadyMeasured.has(r.id));
    if (pending.length === 0) return [];

    // Doelmoment ophalen uit de gekoppelde voorstellen.
    const { data: suggestions } = await this.supabase.client
      .from('ai_suggestions')
      .select('id, trigger_context')
      .in(
        'id',
        pending.map((p) => p.ai_suggestion_id),
      );
    const ctxById = new Map<string, { date?: string; daypart?: string }>();
    for (const s of (suggestions ?? []) as Array<{
      id: string;
      trigger_context: { target_date?: string; target_daypart?: string } | null;
    }>) {
      ctxById.set(s.id, {
        date: s.trigger_context?.target_date,
        daypart: s.trigger_context?.target_daypart,
      });
    }

    const out: TargetedCampaign[] = [];
    for (const r of pending) {
      const ctx = ctxById.get(r.ai_suggestion_id);
      if (!ctx?.date || !ctx.daypart) continue; // geen doel-dagdeel bekend
      if (ctx.date < oldestIso || ctx.date > newestIso) continue;
      out.push({
        campaignId: r.id,
        businessId: r.business_id,
        targetDate: ctx.date,
        daypart: ctx.daypart,
      });
    }
    return out;
  }

  /** Meet de campagnes van één zaak en schrijft de uitkomsten weg. */
  private async measureForBusiness(
    businessId: string,
    campaigns: TargetedCampaign[],
  ): Promise<number> {
    const byDate = await this.loadDaypartActuals(businessId);
    // Dagen mét een campagne horen niet in de baseline: die meten we juist.
    const campaignDates = new Set(campaigns.map((c) => `${c.targetDate}`));

    const rows: Record<string, unknown>[] = [];
    for (const c of campaigns) {
      const weekday = mondayIndex(c.targetDate);
      const target = byDate.get(`${c.targetDate}|${c.daypart}`) ?? null;

      const comparable = comparableDays(
        byDate,
        c.targetDate,
        c.daypart,
        campaignDates,
      );

      const measurable =
        target !== null &&
        target.hours >= MIN_MEASURED_HOURS &&
        comparable.length >= MIN_BASELINE_DAYS;

      const baseline = comparable.length ? median(comparable) : null;
      rows.push({
        business_id: businessId,
        campaign_id: c.campaignId,
        target_date: c.targetDate,
        weekday,
        daypart: c.daypart,
        // Niet-meetbaar schrijven we óók weg, met lege waarden: zo weet de
        // cron dat hij het geprobeerd heeft.
        actual_pct: measurable ? round2(target.avg) : null,
        baseline_pct: measurable && baseline !== null ? round2(baseline) : null,
        lift:
          measurable && baseline !== null
            ? round2(target.avg - baseline)
            : null,
        baseline_days: comparable.length,
        measured_hours: target?.hours ?? 0,
      });
    }

    if (rows.length === 0) return 0;
    const { error } = await this.supabase.client
      .from('campaign_quiet_effect')
      .upsert(rows, { onConflict: 'campaign_id' });
    if (error) {
      this.logger.warn(`wegschrijven meting faalde: ${error.message}`);
      return 0;
    }
    return rows.filter((r) => r.lift !== null).length;
  }

  /**
   * Gemeten drukte per (datum, dagdeel) uit de live-metingen, voor het hele
   * retentievenster van één zaak. Per (datum, uur) de MEDIAAN van live_pct
   * (tegen uitschieters), daarna het gemiddelde over de gemeten uren binnen
   * het dagdeel. Spiegelt getActualByDate; hier per dagdeel geaggregeerd.
   */
  private async loadDaypartActuals(
    businessId: string,
  ): Promise<Map<string, { avg: number; hours: number }>> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - MEASURE_LOOKBACK_DAYS - 1);

    const { data, error } = await this.supabase.client
      .from('busyness_snapshots')
      .select('captured_at, live_pct, live_hour')
      .eq('business_id', businessId)
      .not('live_pct', 'is', null)
      .gte('captured_at', since.toISOString());
    if (error) {
      this.logger.warn(`live-metingen ophalen faalde: ${error.message}`);
      return new Map();
    }

    return aggregateDaypartActuals(
      (data ?? []) as Array<{
        captured_at: string;
        live_pct: number;
        live_hour: number | null;
      }>,
    );
  }

  // ============================================================
  // Lezen (voedt de detectie)
  // ============================================================

  /**
   * Leesbaar overzicht per weekdag×dagdeel voor de rapportage: hoeveel
   * campagnes er gemeten zijn en wat ze gemiddeld met de drukte deden.
   *
   * Bewust mét `samples` erbij: een lift op drie metingen zegt iets heel
   * anders dan een op twaalf, en zonder dat getal leest de eigenaar een
   * toevalstreffer als een bewezen effect. De weging die de detectie zelf
   * gebruikt staat er ook bij, zodat zichtbaar is of dit moment de ranking
   * daadwerkelijk beïnvloedt of nog onder de drempel zit.
   */
  async getSlotReport(businessId: string): Promise<{
    slots: Array<{
      weekday: number;
      daypart: string;
      samples: number;
      medianLift: number;
      /** Telt dit moment al mee in de ranking? */
      counts: boolean;
    }>;
    businessMedianLift: number;
    minSamples: number;
  }> {
    const { slots, businessMedianLift } =
      await this.getSlotPerformance(businessId);
    const out = [...slots.entries()]
      .map(([key, v]) => {
        const [weekday, daypart] = key.split('|');
        return {
          weekday: Number(weekday),
          daypart,
          samples: v.samples,
          medianLift: Math.round(v.medianLift * 10) / 10,
          counts: v.samples >= FEEDBACK_MIN_SAMPLES,
        };
      })
      .sort((a, b) => b.medianLift - a.medianLift);
    return {
      slots: out,
      businessMedianLift: Math.round(businessMedianLift * 10) / 10,
      minSamples: FEEDBACK_MIN_SAMPLES,
    };
  }

  /**
   * Wat campagnes per weekdag×dagdeel-slot hebben opgeleverd, plus de eigen
   * mediaan van de zaak over alle slots. Die mediaan is het ijkpunt: een slot
   * wordt afgezet tegen wat bij déze zaak normaal is, niet tegen nul.
   *
   * Fail-soft: een query-fout levert een lege map op en daarmee geen enkel
   * effect op de detectie.
   */
  async getSlotPerformance(businessId: string): Promise<{
    slots: Map<string, SlotPerformance>;
    businessMedianLift: number;
  }> {
    const empty = {
      slots: new Map<string, SlotPerformance>(),
      businessMedianLift: 0,
    };
    try {
      const { data, error } = await this.supabase.client
        .from('campaign_quiet_effect')
        .select('weekday, daypart, lift')
        .eq('business_id', businessId)
        .not('lift', 'is', null);
      if (error) {
        this.logger.warn(`slot-prestaties ophalen faalde: ${error.message}`);
        return empty;
      }
      const rows = (data ?? []) as Array<{
        weekday: number;
        daypart: string;
        lift: number;
      }>;
      if (rows.length === 0) return empty;

      const perSlot = new Map<string, number[]>();
      const all: number[] = [];
      for (const r of rows) {
        const key = `${r.weekday}|${r.daypart}`;
        const lift = Number(r.lift);
        if (!Number.isFinite(lift)) continue;
        const arr = perSlot.get(key);
        if (arr) arr.push(lift);
        else perSlot.set(key, [lift]);
        all.push(lift);
      }

      const slots = new Map<string, SlotPerformance>();
      for (const [key, lifts] of perSlot) {
        slots.set(key, { medianLift: median(lifts), samples: lifts.length });
      }
      return { slots, businessMedianLift: all.length ? median(all) : 0 };
    } catch (e) {
      this.logger.warn(`slot-prestaties faalden: ${String(e)}`);
      return empty;
    }
  }
}

// ============================================================
// Rekenkern (puur, dus zonder Supabase te testen)
// ============================================================

export type DaypartActual = { avg: number; hours: number };

/**
 * Live-metingen omzetten naar gemeten drukte per (datum, dagdeel).
 * Sleutel is `YYYY-MM-DD|dagdeel`.
 *
 * Twee stappen, en de volgorde doet ertoe: eerst per UUR de mediaan van alle
 * metingen in dat uur (Google's live-waarde is grof en springt; de mediaan
 * vangt dat), pas daarna het gemiddelde over de uren van het dagdeel. Andersom
 * zou één uitschieter-uur het hele dagdeel meetrekken. `hours` telt hoeveel
 * uren van het dagdeel überhaupt gemeten zijn — een dagdeel op één uur is
 * geen betrouwbare waarneming.
 */
export function aggregateDaypartActuals(
  rows: Array<{
    captured_at: string;
    live_pct: number;
    live_hour: number | null;
  }>,
): Map<string, DaypartActual> {
  // bucket[datum][uur] = [pct, ...]
  const bucket: Record<string, Record<number, number[]>> = {};
  for (const row of rows) {
    const when = new Date(row.captured_at);
    const date = amsterdamDate(when);
    const hour = row.live_hour ?? amsterdamHour(when);
    if (hour == null || hour < 0 || hour > 23) continue;
    (bucket[date] ??= {})[hour] ??= [];
    bucket[date][hour].push(row.live_pct);
  }

  const out = new Map<string, DaypartActual>();
  for (const [date, hours] of Object.entries(bucket)) {
    for (const dp of DAYPART_DEFS) {
      const vals: number[] = [];
      for (let h = dp.from; h < dp.to; h++) {
        const pcts = hours[h];
        if (pcts?.length) vals.push(median(pcts));
      }
      if (vals.length === 0) continue;
      out.set(`${date}|${dp.key}`, {
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        hours: vals.length,
      });
    }
  }
  return out;
}

/**
 * De baseline voor één doelmoment: de mediaan van dezelfde maat over
 * vergelijkbare dagen — zelfde weekdag, zelfde dagdeel, geen campagne.
 * Geeft de gebruikte waarden terug zodat de caller kan zien waar de baseline
 * op rust.
 */
export function comparableDays(
  actuals: Map<string, DaypartActual>,
  targetDate: string,
  daypart: string,
  excludeDates: Set<string>,
): number[] {
  const weekday = mondayIndex(targetDate);
  const out: number[] = [];
  for (const [key, value] of actuals) {
    const [date, dp] = key.split('|');
    if (dp !== daypart) continue;
    if (date === targetDate || excludeDates.has(date)) continue;
    if (mondayIndex(date) !== weekday) continue;
    out.push(value.avg);
  }
  return out;
}

// ============================================================
// Helpers (klein en puur; bewust niet gedeeld met BusynessService, die
// dezelfde bewerkingen als private methodes heeft)
// ============================================================

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Weekdag 0=ma..6=zo voor een YYYY-MM-DD (UTC-noon → tz-veilig). */
function mondayIndex(iso: string): number {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=zo..6=za
  return (dow + 6) % 7;
}

function amsterdamDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = p.find((x) => x.type === 'year')?.value ?? '1970';
  const m = p.find((x) => x.type === 'month')?.value ?? '01';
  const day = p.find((x) => x.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

function amsterdamHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      hour12: false,
    }).format(d),
    10,
  );
}
