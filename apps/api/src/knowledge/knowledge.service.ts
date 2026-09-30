import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { throwDbError } from '../common/db-error';
import { analyzeObservations } from './knowledge-analysis';
import { formatKnowledgeBrief } from './knowledge-brief';
import { normalizeRows } from './knowledge-normalize';
import type { ImportMapping, Insight, Observation } from './knowledge.types';

/**
 * ============================================================
 * Kennisbank "wat werkt" (mig 0085)
 * ============================================================
 *
 * Intern: de klant ziet dit nooit. Flow:
 *   bron registreren  ->  ruw bestand opslaan (kb_raw_imports, elke vorm)
 *   ->  normaliseren naar metingen (kb_observations, volgens een mapping)
 *   ->  analyseren (kb_insights: wat werkt nu en wat minder)
 *   ->  Filly leest een kort kennisblok (getBrief) bij het maken van voorstellen.
 *
 * Alles draait op de service-role client (RLS aan, geen policies): alleen wij
 * vullen en lezen dit. Zonder data geeft getBrief een lege string en gedraagt
 * Filly zich exact als voorheen. Een fout hier mag campagnes nooit blokkeren.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private readonly admin: SupabaseService) {}

  async createSource(input: {
    name: string;
    url?: string;
    publisher?: string;
    kind?: string;
    commercialUse?: 'ja' | 'nee' | 'onbekend';
    reliability?: 1 | 2 | 3;
    retrievedAt?: string;
    notes?: string;
  }): Promise<string> {
    const { data, error } = await this.admin.client
      .from('kb_sources')
      .insert({
        name: input.name,
        url: input.url ?? null,
        publisher: input.publisher ?? null,
        kind: input.kind ?? 'anders',
        commercial_use: input.commercialUse ?? 'onbekend',
        reliability: input.reliability ?? 2,
        retrieved_at: input.retrievedAt ?? null,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();
    if (error) throwDbError(this.logger, error);
    return (data as { id: string }).id;
  }

  /** Slaat het ruwe bestand op zoals het kwam, zodat we altijd opnieuw kunnen normaliseren. */
  async importRaw(input: {
    sourceId: string;
    rows: Record<string, unknown>[];
    filename?: string;
    format?: string;
  }): Promise<string> {
    const { data, error } = await this.admin.client
      .from('kb_raw_imports')
      .insert({
        source_id: input.sourceId,
        filename: input.filename ?? null,
        format: input.format ?? 'json',
        payload: input.rows,
        row_count: input.rows.length,
      })
      .select('id')
      .single();
    if (error) throwDbError(this.logger, error);
    return (data as { id: string }).id;
  }

  /** Zet een ruwe import om naar metingen. Opnieuw draaien vervangt de eerdere metingen van deze import. */
  async normalizeImport(
    importId: string,
    mapping: ImportMapping,
  ): Promise<{ inserted: number; skipped: number; reasons: Record<string, number> }> {
    const { data: imp, error } = await this.admin.client
      .from('kb_raw_imports')
      .select('id, source_id, payload')
      .eq('id', importId)
      .single();
    if (error) throwDbError(this.logger, error);
    const row = imp as { id: string; source_id: string; payload: Record<string, unknown>[] };

    const result = normalizeRows(row.payload, mapping);
    await this.admin.client.from('kb_observations').delete().eq('import_id', importId);

    const records = result.observations.map((o) => ({
      source_id: row.source_id,
      import_id: importId,
      channel: o.channel,
      format: o.format ?? null,
      topic: o.topic ?? null,
      country: o.country ?? null,
      region: o.region ?? null,
      weekday: o.weekday ?? null,
      daypart: o.daypart ?? null,
      season: o.season ?? null,
      metric: o.metric,
      unit: o.unit ?? null,
      value: o.value,
      sample_size: o.sampleSize ?? null,
      period_end: o.periodEnd ?? null,
    }));
    for (let i = 0; i < records.length; i += 500) {
      const { error: insErr } = await this.admin.client
        .from('kb_observations')
        .insert(records.slice(i, i + 500));
      if (insErr) throwDbError(this.logger, insErr);
    }
    await this.admin
      .client.from('kb_raw_imports')
      .update({ mapping, status: 'genormaliseerd', error: null })
      .eq('id', importId);
    return { inserted: records.length, skipped: result.skipped, reasons: result.reasons };
  }

  /** Rekent alle inzichten opnieuw uit en vervangt de oude. */
  async runAnalysis(now: Date = new Date()): Promise<{ observations: number; insights: number }> {
    const observations = await this.loadObservations();
    const insights = analyzeObservations(observations, now);

    const { error: delErr } = await this.admin.client
      .from('kb_insights')
      .delete()
      .not('id', 'is', null);
    if (delErr) throwDbError(this.logger, delErr);
    const records = insights.map((i) => ({
      channel: i.channel,
      dimension: i.dimension,
      dimension_value: i.dimensionValue,
      metric: i.metric,
      unit: i.unit,
      lift: i.lift,
      n_observations: i.nObservations,
      n_sources: i.nSources,
      total_sample: i.totalSample,
      confidence: i.confidence,
      computed_at: now.toISOString(),
    }));
    for (let i = 0; i < records.length; i += 500) {
      const { error } = await this.admin.client.from('kb_insights').insert(records.slice(i, i + 500));
      if (error) throwDbError(this.logger, error);
    }
    return { observations: observations.length, insights: records.length };
  }

  /**
   * Het kennisblok voor Filly's prompt. Bewust nooit een fout naar buiten: bij
   * elk probleem krijgt Filly geen kennisblok en gaat alles gewoon door.
   */
  async getBrief(channels: string[]): Promise<string> {
    if (channels.length === 0) return '';
    try {
      const { data, error } = await this.admin.client
        .from('kb_insights')
        .select('channel, dimension, dimension_value, metric, unit, lift, n_observations, n_sources, total_sample, confidence')
        .in('channel', channels);
      if (error) throw error;
      const insights: Insight[] = (data ?? []).map((r: Record<string, unknown>) => ({
        channel: r.channel as string,
        dimension: r.dimension as Insight['dimension'],
        dimensionValue: r.dimension_value as string,
        metric: r.metric as string,
        unit: (r.unit as string | null) ?? null,
        lift: Number(r.lift),
        nObservations: Number(r.n_observations),
        nSources: Number(r.n_sources),
        totalSample: Number(r.total_sample),
        confidence: r.confidence as Insight['confidence'],
      }));
      return formatKnowledgeBrief(insights, channels);
    } catch (e) {
      this.logger.warn(`Kennisbank niet beschikbaar: ${(e as Error).message}`);
      return '';
    }
  }

  private async loadObservations(): Promise<Observation[]> {
    const out: Observation[] = [];
    const { data: sources, error: sErr } = await this.admin.client
      .from('kb_sources')
      .select('id, reliability');
    if (sErr) throwDbError(this.logger, sErr);
    const rel = new Map(
      ((sources ?? []) as { id: string; reliability: number }[]).map((s) => [s.id, s.reliability]),
    );
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.admin.client
        .from('kb_observations')
        .select('source_id, channel, format, topic, country, region, weekday, daypart, season, metric, unit, value, sample_size, period_end')
        .range(from, from + 999);
      if (error) throwDbError(this.logger, error);
      const rows = (data ?? []) as Record<string, unknown>[];
      for (const r of rows) {
        out.push({
          sourceId: r.source_id as string,
          channel: r.channel as string,
          format: r.format as string | null,
          topic: r.topic as string | null,
          country: r.country as string | null,
          region: r.region as string | null,
          weekday: r.weekday as number | null,
          daypart: r.daypart as string | null,
          season: r.season as string | null,
          metric: r.metric as string,
          unit: r.unit as string | null,
          value: Number(r.value),
          sampleSize: r.sample_size as number | null,
          periodEnd: r.period_end as string | null,
          reliability: rel.get(r.source_id as string) ?? 2,
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  }
}
