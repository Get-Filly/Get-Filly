import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================================
// EventsService — events nabij een restaurant + prompt-blok
// ============================================================
//
// De staffel (besloten met Floris, 2026-06-11): hoe groot het event,
// hoe verder het publiek reist — dus géén gemeente-grenzen maar
// afstand per categorie. Klein (kermis/markt) is hyperlokaal; een
// bovenregionale trekker als het Dickens Festijn in Deventer is ook
// voor omliggende dorpen relevant, mits eerlijk geframed ("10 min
// rijden, wél plek") — die framing-regel zit in het blok.

const STAFFEL_KM: Record<string, number> = {
  kermis: 2,
  markten: 2,
  concerten_theater: 5,
  sportevenementen: 5,
  events: 5,
  festivals: 10,
};
const MAX_RADIUS_KM = Math.max(...Object.values(STAFFEL_KM));

// Planningshorizon: zelfde 21 dagen als de feestdagen-factor.
const WINDOW_DAYS = 21;
// Max events in het blok; meer is prompt-ruis.
const MAX_IN_BLOCK = 8;

const CATEGORY_LABEL: Record<string, string> = {
  festivals: 'festival',
  concerten_theater: 'concert/theater',
  events: 'event',
  sportevenementen: 'sportevenement',
  kermis: 'kermis',
  markten: 'markt',
};

export type NearbyEvent = {
  name: string;
  category: string;
  place: string;
  startsOn: string;
  distanceKm: number;
  sourceUrl: string;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Events binnen de staffel-radius van dit restaurant, komende
   * 21 dagen. Fail-soft: geen coördinaten of een query-fout levert
   * een lege lijst op, nooit een gecrashte AI-feature.
   */
  async findNearby(restaurantId: string): Promise<NearbyEvent[]> {
    try {
      const { data: restaurant } = await this.supabase.client
        .from('restaurants')
        .select('latitude, longitude')
        .eq('id', restaurantId)
        .maybeSingle();
      const lat = restaurant?.latitude as number | null;
      const lng = restaurant?.longitude as number | null;
      if (lat == null || lng == null) return [];

      const today = new Date().toISOString().slice(0, 10);
      const until = new Date(Date.now() + WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);

      // Grove bounding-box in SQL (1° lat ≈ 111 km; 1° lng ≈ 68 km
      // op NL-breedte), daarna exacte haversine + staffel in JS.
      const latMargin = MAX_RADIUS_KM / 111;
      const lngMargin = MAX_RADIUS_KM / 68;
      const { data, error } = await this.supabase.client
        .from('events')
        .select('source_slug, name, category, place, starts_on, latitude, longitude')
        .gte('starts_on', today)
        .lte('starts_on', until)
        .not('latitude', 'is', null)
        .gte('latitude', lat - latMargin)
        .lte('latitude', lat + latMargin)
        .gte('longitude', lng - lngMargin)
        .lte('longitude', lng + lngMargin)
        .order('starts_on', { ascending: true });
      if (error) {
        this.logger.warn(`events-query faalde: ${error.message}`);
        return [];
      }

      const nearby: NearbyEvent[] = [];
      for (const row of (data ?? []) as Array<{
        source_slug: string;
        name: string;
        category: string;
        place: string | null;
        starts_on: string;
        latitude: number;
        longitude: number;
      }>) {
        const distanceKm = haversineKm(lat, lng, row.latitude, row.longitude);
        const radius = STAFFEL_KM[row.category] ?? 5;
        if (distanceKm > radius) continue;
        nearby.push({
          name: row.name,
          category: row.category,
          place: row.place ?? '',
          startsOn: row.starts_on,
          distanceKm: Math.round(distanceKm * 10) / 10,
          sourceUrl: `https://evenementen.nl/events/${row.source_slug}`,
        });
        if (nearby.length >= MAX_IN_BLOCK) break;
      }
      return nearby;
    } catch (err) {
      this.logger.warn(`findNearby faalde: ${String(err)}`);
      return [];
    }
  }

  /**
   * Bouwt het EVENEMENTEN IN DE BUURT-blok voor een system-prompt.
   * Lege string als er niets in de buurt is (geen blok = geen ruis).
   */
  async buildEventsBlock(restaurantId: string): Promise<string> {
    const nearby = await this.findNearby(restaurantId);
    if (nearby.length === 0) return '';

    const dayNames = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    const lines: string[] = [];
    lines.push(
      'EVENEMENTEN IN DE BUURT (komende 21 dagen, afstand vanaf de zaak; bron: evenementen.nl):',
    );
    for (const e of nearby) {
      const weekday = dayNames[new Date(`${e.startsOn}T12:00:00`).getDay()];
      // place bevat de officiële PDOK-woonplaatsnaam ("West-Terschelling").
      const placeLabel = e.place ?? '';
      lines.push(
        `- ${weekday} ${e.startsOn}: ${e.name} (${CATEGORY_LABEL[e.category] ?? e.category}${placeLabel ? `, ${placeLabel}` : ''}, ${e.distanceKm} km) — ${e.sourceUrl}`,
      );
    }
    lines.push('');
    lines.push('EVENEMENT-REGELS:');
    lines.push(
      '- Lead-times: festival/concert 5-10 dagen vooraf communiceren, sportevenement 2-3 dagen, beurs/zakelijk event 14-21 dagen (mail naar zakelijk segment).',
    );
    lines.push(
      '- Frame eerlijk op afstand: <2 km = meeliften op loop-traffic (pre/post-event diner, "rustpunt in de drukte"); verder weg = positioneer als uitwijk of rustig alternatief ("na het festival rustig nadineren, 10 minuten rijden, wél plek"). Doe NOOIT alsof een event "bij ons" plaatsvindt als het in een andere plaats is.',
    );
    lines.push(
      '- Een groot event vlakbij kan ook een drukte-signaal zijn: die dag is geen activatie-campagne nodig, wel bv. een "reserveer tijdig"-post.',
    );
    return lines.join('\n');
  }
}

/** Groot-cirkel-afstand in km (haversine). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
