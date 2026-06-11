import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GeocodingService } from '../geocoding/geocoding.service';

// ============================================================
// EventsSyncService — wekelijkse sitemap-sync van evenementen.nl
// ============================================================
//
// Bewust de lichtst mogelijke aanpak (zie BACKLOG "Evenementen.nl
// als hoofdbron"): we lezen alléén de 6 sitemap-XML's die de site
// zelf voor crawlers aanbiedt (6 requests per run, robots.txt staat
// dit toe) en scrapen géén detail-pagina's. De slugs bevatten al
// naam + plaats + datum ("dickens-festijn-deventer-2026-12-19");
// de plaats geocoderen we op woonplaats-niveau via PDOK met een
// permanente cache (event_places) zodat elke unieke plaatsnaam
// maar één keer een PDOK-call kost.
//
// Serverless-budget: de api draait op Vercel met een maxDuration-
// limiet, dus de plaats-resolutie is incrementeel: per run maximaal
// GEOCODE_BUDGET nieuwe PDOK-lookups, gesorteerd op events die het
// éérst plaatsvinden. Na een paar runs is vrijwel alles resolved;
// cache-hits kosten daarna niets meer.

const SITEMAP_BASE = 'https://evenementen.nl/sitemap-events';
const EVENT_URL_PREFIX = 'https://evenementen.nl/events/';
const CATEGORIES = [
  'festivals',
  'concerten_theater',
  'events',
  'sportevenementen',
  'kermis',
  'markten',
] as const;

// Alleen events in dit venster bewaren: verleden is nutteloos en
// >120 dagen vooruit valt buiten elke promotie-lead-time.
const HORIZON_DAYS = 120;
// Max nieuwe PDOK-lookups per run (incrementeel; in groepjes van 5
// parallel ≈ 16s bij vol budget — past in de 60s-functielimiet).
const GEOCODE_BUDGET = 200;
const GEOCODE_CONCURRENCY = 5;
// Max events per run door de plaats-resolutie.
const RESOLVE_BATCH = 400;
const FETCH_TIMEOUT_MS = 10_000;

type ParsedSlug = {
  slug: string;
  category: string;
  /** Slug minus de datum, bv. "dickens-festijn-deventer". */
  rest: string;
  startsOn: string; // YYYY-MM-DD
};

@Injectable()
export class EventsSyncService {
  private readonly logger = new Logger(EventsSyncService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geocoding: GeocodingService,
  ) {}

  // Volledige run: sitemaps → upsert → plaats-resolutie. Retourneert
  // stats voor de cron-log.
  async runSync(): Promise<{
    fetched: number;
    inHorizon: number;
    upserted: number;
    resolved: number;
    geocodeCallsUsed: number;
  }> {
    const parsed = await this.fetchAndParseSitemaps();

    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const inHorizon = parsed.filter(
      (p) => p.startsOn >= today && p.startsOn <= horizon,
    );

    const upserted = await this.upsertEvents(inHorizon);
    const { resolved, geocodeCallsUsed } = await this.resolvePlaces(today);

    this.logger.log(
      `events-sync klaar: ${parsed.length} slugs gelezen, ${inHorizon.length} binnen horizon, ${upserted} ge-upsert, ${resolved} plaatsen resolved (${geocodeCallsUsed} PDOK-calls).`,
    );
    return {
      fetched: parsed.length,
      inHorizon: inHorizon.length,
      upserted,
      resolved,
      geocodeCallsUsed,
    };
  }

  // ---------- Stap 1: sitemaps ophalen + slugs parsen ----------

  private async fetchAndParseSitemaps(): Promise<ParsedSlug[]> {
    const results = await Promise.all(
      CATEGORIES.map(async (category) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            FETCH_TIMEOUT_MS,
          );
          const res = await fetch(`${SITEMAP_BASE}/${category}.xml`, {
            signal: controller.signal,
            headers: {
              // Nette identificatie, zelfde praktijk als GeocodingService.
              'User-Agent': 'Get-Filly/1.0 (+https://get-filly.com)',
            },
          });
          clearTimeout(timeout);
          if (!res.ok) {
            this.logger.warn(
              `Sitemap ${category} gaf HTTP ${res.status}; categorie overgeslagen.`,
            );
            return [];
          }
          const xml = await res.text();
          return this.parseSitemap(xml, category);
        } catch (err) {
          // Eén kapotte categorie mag de rest niet blokkeren.
          this.logger.warn(`Sitemap ${category} mislukt: ${String(err)}`);
          return [];
        }
      }),
    );
    return results.flat();
  }

  private parseSitemap(xml: string, category: string): ParsedSlug[] {
    const out: ParsedSlug[] = [];
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    for (const loc of locs) {
      const url = loc.replace(/<\/?loc>/g, '').trim();
      if (!url.startsWith(EVENT_URL_PREFIX)) continue;
      const slug = url.slice(EVENT_URL_PREFIX.length);
      // Alle slugs eindigen op -YYYY-MM-DD (gevalideerd 2026-06-11:
      // 0 uitzonderingen op 4149 festival-slugs).
      const m = slug.match(/^(.+)-(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      const startsOn = m[2];
      // Sanity-check op de datum (regex laat bv. maand 99 door).
      if (Number.isNaN(Date.parse(startsOn))) continue;
      out.push({ slug, category, rest: m[1], startsOn });
    }
    return out;
  }

  // ---------- Stap 2: upsert in events ----------

  private async upsertEvents(items: ParsedSlug[]): Promise<number> {
    let upserted = 0;
    // Batches van 500: ruim binnen de Supabase payload-limieten.
    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500).map((p) => ({
        source: 'evenementen_nl',
        source_slug: p.slug,
        // Voorlopige naam = hele rest; wordt netter zodra de plaats
        // resolved is (dan strippen we de plaats-tokens eraf).
        name: prettify(p.rest),
        category: p.category,
        starts_on: p.startsOn,
      }));
      const { error } = await this.supabase.client
        .from('events')
        .upsert(batch, {
          onConflict: 'source,source_slug',
          ignoreDuplicates: true,
        });
      if (error) {
        this.logger.warn(`events-upsert batch faalde: ${error.message}`);
        continue;
      }
      upserted += batch.length;
    }
    return upserted;
  }

  // ---------- Stap 3: plaats-resolutie (incrementeel) ----------
  //
  // De plaats is het láátste token (soms 2-3 tokens, bv. den-bosch)
  // vóór de datum. We proberen suffixen van 1 → 3 tokens tegen de
  // event_places-cache en pas bij een cache-miss tegen PDOK
  // (fq=type:woonplaats zodat "centrum" niet op een straat matcht).
  //
  // PDOK matcht fuzzy: "bosch" → 's-Hertogenbosch (gewenst!), maar
  // "zee" → Zeeland (fout, hoort bij katwijk-aan-zee). Daarom twee
  // trappen: een kandidaat waarvan de naam exact gelijk is aan de
  // PDOK-woonplaats wint (genormaliseerd, met alias-lijst voor
  // den-bosch/den-haag); is er géén exacte match op enig niveau,
  // dan geldt de fuzzy match van de LANGSTE kandidaat als fallback
  // (langer = specifieker = veiliger gefuzzed).

  private async resolvePlaces(
    today: string,
  ): Promise<{ resolved: number; geocodeCallsUsed: number }> {
    const { data, error } = await this.supabase.client
      .from('events')
      .select('id, source_slug, category, starts_on')
      .is('latitude', null)
      .gte('starts_on', today)
      .order('starts_on', { ascending: true })
      .limit(RESOLVE_BATCH);
    if (error) {
      this.logger.warn(`unresolved-events query faalde: ${error.message}`);
      return { resolved: 0, geocodeCallsUsed: 0 };
    }
    const events = (data ?? []) as Array<{
      id: string;
      source_slug: string;
      category: string;
      starts_on: string;
    }>;
    if (events.length === 0) return { resolved: 0, geocodeCallsUsed: 0 };

    // Alle kandidaat-suffixen verzamelen en de cache in één query laden.
    const candidatesPerEvent = events.map((e) => ({
      ...e,
      candidates: suffixCandidates(e.source_slug),
    }));
    const allCandidates = [
      ...new Set(candidatesPerEvent.flatMap((e) => e.candidates)),
    ];
    type PlaceEntry = {
      found: boolean;
      matched_name: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    const cache = new Map<string, PlaceEntry>();
    for (let i = 0; i < allCandidates.length; i += 500) {
      const { data: rows } = await this.supabase.client
        .from('event_places')
        .select('place, found, matched_name, latitude, longitude')
        .in('place', allCandidates.slice(i, i + 500));
      for (const row of (rows ?? []) as Array<
        PlaceEntry & { place: string }
      >) {
        cache.set(row.place, row);
      }
    }

    // Per niveau (1 → 3 suffix-tokens): geocode de ontbrekende
    // kandidaten in groepjes parallel. Een event stopt met geocoderen
    // zodra een EXACTE naam-match gevonden is; de meeste events
    // resolven al op niveau 1 (één-token-plaatsen).
    let geocodeCallsUsed = 0;
    const newCacheRows: Array<{ place: string } & PlaceEntry> = [];
    const hasExact = (e: { candidates: string[] }) =>
      e.candidates.some((c) => {
        const entry = cache.get(c);
        return entry?.found && isExactPlaceMatch(c, entry.matched_name);
      });

    let working = candidatesPerEvent;
    for (let level = 0; level < 3 && working.length > 0; level++) {
      const missing = [
        ...new Set(
          working
            .map((e) => e.candidates[level])
            .filter((c): c is string => Boolean(c) && !cache.has(c)),
        ),
      ].slice(0, Math.max(0, GEOCODE_BUDGET - geocodeCallsUsed));

      for (let i = 0; i < missing.length; i += GEOCODE_CONCURRENCY) {
        const group = missing.slice(i, i + GEOCODE_CONCURRENCY);
        const results = await Promise.all(
          group.map((cand) =>
            this.geocoding.geocode({
              city: cand.replace(/-/g, ' '),
              typeFilter: 'woonplaats',
            }),
          ),
        );
        geocodeCallsUsed += group.length;
        group.forEach((cand, idx) => {
          const result = results[idx];
          const found =
            result !== null && result.match_type === 'woonplaats';
          const entry: PlaceEntry = {
            found,
            // Eerste deel van de weergavenaam = de woonplaats zelf
            // ("Schijndel, Meierijstad, Noord-Brabant" → "Schijndel").
            matched_name: found
              ? (result.matched_name.split(',')[0]?.trim() ?? null)
              : null,
            latitude: found ? result.latitude : null,
            longitude: found ? result.longitude : null,
          };
          cache.set(cand, entry);
          newCacheRows.push({ place: cand, ...entry });
        });
      }

      // Events met een exacte match hoeven geen hogere niveaus meer.
      working = working.filter((e) => !hasExact(e));
    }

    // Beslissen per event: exact wint; anders fuzzy op de langste
    // gevonden kandidaat; staat er nog een kandidaat zónder cache-
    // entry (budget op), dan wachten we op de volgende run.
    const updates: Array<{
      source_slug: string;
      category: string;
      starts_on: string;
      place: string;
      latitude: number;
      longitude: number;
      name: string;
    }> = [];
    for (const event of candidatesPerEvent) {
      const entries = event.candidates.map((c) => ({
        candidate: c,
        entry: cache.get(c),
      }));
      const exact = entries.find(
        ({ candidate, entry }) =>
          entry?.found && isExactPlaceMatch(candidate, entry.matched_name),
      );
      let chosen = exact ?? null;
      if (!chosen) {
        if (entries.some(({ entry }) => !entry)) continue; // budget op → volgende run
        // Fuzzy fallback: langste kandidaat eerst (specifiekst).
        chosen =
          [...entries].reverse().find(({ entry }) => entry?.found) ?? null;
      }
      if (
        !chosen ||
        !chosen.entry ||
        chosen.entry.latitude === null ||
        chosen.entry.longitude === null
      ) {
        continue; // onresolvebaar; cache-hits maken dit gratis volgende run
      }
      const restWithoutDate = event.source_slug.replace(
        /-\d{4}-\d{2}-\d{2}$/,
        '',
      );
      updates.push({
        source_slug: event.source_slug,
        category: event.category,
        starts_on: event.starts_on,
        place: chosen.candidate,
        latitude: chosen.entry.latitude,
        longitude: chosen.entry.longitude,
        name: prettify(stripPlaceSuffix(restWithoutDate, chosen.candidate)),
      });
    }

    // Cache-rijen en event-updates in bulk wegschrijven (geen
    // per-rij round-trips; dat past niet in de functie-tijdslimiet).
    for (let i = 0; i < newCacheRows.length; i += 500) {
      const { error: cacheErr } = await this.supabase.client
        .from('event_places')
        .upsert(newCacheRows.slice(i, i + 500), { onConflict: 'place' });
      if (cacheErr) {
        this.logger.warn(`event_places-upsert faalde: ${cacheErr.message}`);
      }
    }
    for (let i = 0; i < updates.length; i += 500) {
      const batch = updates.slice(i, i + 500).map((u) => ({
        source: 'evenementen_nl',
        source_slug: u.source_slug,
        category: u.category,
        starts_on: u.starts_on,
        name: u.name,
        place: u.place,
        latitude: u.latitude,
        longitude: u.longitude,
        updated_at: new Date().toISOString(),
      }));
      const { error: updErr } = await this.supabase.client
        .from('events')
        .upsert(batch, { onConflict: 'source,source_slug' });
      if (updErr) {
        this.logger.warn(`events-resolve-upsert faalde: ${updErr.message}`);
      }
    }

    return { resolved: updates.length, geocodeCallsUsed };
  }
}

// ---------- Slug-helpers (puur, los testbaar) ----------

/**
 * Kandidaat-plaatsnamen uit een slug: suffixen van 1 → 3 tokens vóór
 * de datum. "dickens-festijn-deventer-2026-12-19" → ["deventer",
 * "festijn-deventer", "dickens-festijn-deventer"]. Eén-token-plaatsen
 * komen het meest voor, dus die proberen we eerst.
 */
export function suffixCandidates(slug: string): string[] {
  const rest = slug.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const tokens = rest.split('-').filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= Math.min(3, tokens.length); n++) {
    out.push(tokens.slice(tokens.length - n).join('-'));
  }
  return out;
}

/** Plaats-suffix van de naam strippen: "1-ander-festival-schijndel" + "schijndel" → "1-ander-festival". */
export function stripPlaceSuffix(rest: string, place: string): string {
  return rest.endsWith(`-${place}`)
    ? rest.slice(0, rest.length - place.length - 1)
    : rest;
}

/** "1-ander-festival" → "1 ander festival" met hoofdletter. */
export function prettify(slugPart: string): string {
  const text = slugPart.replace(/-/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Roepnamen waarvan de officiële BAG-woonplaats anders heet; PDOK
// vertaalt de query goed, maar de exact-match-check zou ze anders
// onterecht afwijzen.
const PLACE_ALIASES: Record<string, string> = {
  denbosch: 'shertogenbosch',
  denhaag: 'sgravenhage',
};

/** Plaatsnaam-normalisatie voor vergelijking: lowercase, zonder diacritics en leestekens. */
export function normalizePlace(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Is de PDOK-woonplaats exact de kandidaat uit de slug? "schijndel" ↔
 * "Schijndel" → ja; "zee" ↔ "Zeeland" → nee (fuzzy, alleen fallback);
 * "den-bosch" ↔ "'s-Hertogenbosch" → ja via de alias-lijst.
 */
export function isExactPlaceMatch(
  candidate: string,
  matchedName: string | null,
): boolean {
  if (!matchedName) return false;
  const cand = normalizePlace(candidate);
  const matched = normalizePlace(matchedName);
  return cand === matched || PLACE_ALIASES[cand] === matched;
}
