import { Injectable, Logger } from '@nestjs/common';
import { OccupancyService, type OccupancyDay } from '../occupancy/occupancy.service';
import { WeatherService, type ForecastDay } from '../weather/weather.service';
import { ReservationsService } from '../reservations/reservations.service';
import type { Reservation } from '../reservations/reservations.service';

// ============================================================
// RestaurantContextService — actuele feiten voor AI-prompts
// ============================================================
//
// Bouwt één compact NL-tekstblok met wat Filly moet weten om zinvolle
// antwoorden te geven: weer van komende dagen, bezetting, aantal
// reserveringen. Dit blok gaat in de system-prompt van chat én
// straks suggesties — een gedeelde fundering voor alle Filly-features
// die "weten wat er speelt" nodig hebben.
//
// Ontwerp-keuzes:
//   - Alle bronnen parallel ophalen (Promise.all) → ~150ms toevoegen
//     aan een chat-call van 1-3 seconden is verwaarloosbaar.
//   - Fail-soft: als één bron faalt (bv. weer mist coordinaten),
//     laten we dat stukje gewoon weg en doen de rest wel. Filly
//     merkt zelf of iets ontbreekt en vraagt ernaar.
//   - Compact formatteren: elk extra token in input kost geld. We
//     geven één regel per dag, niet vijf.
//   - NL datums ("do 24 apr") zodat Filly in haar antwoord
//     dezelfde termen kan hergebruiken zonder te hoeven parsen.
// ============================================================

@Injectable()
export class RestaurantContextService {
  private readonly logger = new Logger(RestaurantContextService.name);

  constructor(
    private readonly occupancy: OccupancyService,
    private readonly weather: WeatherService,
    private readonly reservations: ReservationsService,
  ) {}

  async buildContextBlock(restaurantId: string): Promise<string> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Parallel ophalen. Elke bron heeft zijn eigen catch zodat één
    // falende service (bv. weer zonder coords) niet het hele block
    // laat sneuvelen — Filly ziet dan simpelweg minder data.
    const [occ, weather, reservations] = await Promise.all<
      [Promise<OccupancyDay[]>, Promise<ForecastDay[]>, Promise<Reservation[]>]
    >([
      this.occupancy
        .getMonth(restaurantId, now.getFullYear(), now.getMonth())
        .catch((e) => {
          this.logger.warn(`Occupancy niet beschikbaar: ${String(e)}`);
          return [] as OccupancyDay[];
        }),
      this.weather.getForecastForRestaurant(restaurantId).catch((e) => {
        this.logger.warn(`Weer niet beschikbaar: ${String(e)}`);
        return [] as ForecastDay[];
      }),
      this.reservations.findRange(restaurantId, today, in7days).catch((e) => {
        this.logger.warn(`Reserveringen niet beschikbaar: ${String(e)}`);
        return [] as Reservation[];
      }),
    ]);

    const parts: string[] = [];

    // Datum-referentie bovenaan zodat Filly weet "vandaag" concreet
    // is. Voorkomt dat ze refereert naar "morgen" zonder datum en
    // wij niet kunnen checken of dat klopt.
    parts.push(`Vandaag is ${formatLongDate(now)}.`);

    // Weer: vandaag t/m +3. Meer dan 3 dagen is meestal onnodig voor
    // een chat-vraag en blaast tokens op. Filly kan altijd doorvragen.
    if (weather.length > 0) {
      const weatherLines = weather.slice(0, 4).map((w) => {
        const label = w.dayLabel ?? w.date;
        return `  - ${label} (${w.date}): ${w.description}, ${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C`;
      });
      parts.push(`Weersverwachting:\n${weatherLines.join('\n')}`);
    }

    // Bezetting: alleen vandaag + komende 6 dagen. De maand hebben we
    // al in geheugen, we filteren op datumbereik.
    const upcomingOcc = occ
      .filter((d) => d.date >= today && d.date <= in7days)
      .slice(0, 7);
    if (upcomingOcc.length > 0) {
      const occLines = upcomingOcc.map(
        (d) =>
          `  - ${d.date}: ${d.occupancy_pct}% bezetting (~${d.estimated_guests} gasten)`,
      );
      parts.push(`Bezetting komende dagen:\n${occLines.join('\n')}`);
    }

    // Reserveringen: alleen totalen noemen. Lijst van namen is privacy-
    // gevoelig en vaak niet relevant voor een chat-vraag. Filly kan
    // vragen of hij namen mag zien.
    if (reservations.length > 0) {
      const todayRes = reservations.filter((r) => r.reservation_date === today);
      parts.push(
        `Reserveringen: ${reservations.length} de komende 7 dagen, waarvan ${todayRes.length} vandaag.`,
      );
    } else {
      parts.push('Reserveringen: geen geregistreerd de komende 7 dagen.');
    }

    return parts.join('\n\n');
  }
}

// Schrijft datum als "do 24 apr 2026". Korte NL-notatie voelt
// natuurlijker voor Filly's antwoorden dan ISO-strings.
function formatLongDate(d: Date): string {
  return d.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
