/**
 * ============================================================
 * Wanneer plaatsen we een uiting? (relatief aan het voorgestelde moment)
 * ============================================================
 *
 * Voorheen kreeg elke uiting een vast uur op de gekozen dag (Instagram 18:00),
 * ook als het rustige moment de middag was. De post stond dan NA het moment.
 * Nu plannen we vanaf het begin van het voorgestelde tijdvenster terug,
 * met de regels per kanaal (CHANNEL_RULES):
 *   - vroegste inplanning (leadTime.minHours): daarna heeft plaatsen geen zin;
 *   - optimale voorsprong (leadTime.optimalRangeHours): liefst zo ver vooruit;
 *   - beste uren (bestTimes.bestHours): we plaatsen aan het begin van zo'n venster.
 * Puur: geen database, geen klok. `now` geven we mee.
 */
import { CHANNEL_RULES, type FillyChannel } from './filly-brain.config';
import { amsterdamIsoAtHour, todayNl } from '../common/date-nl';

const HOUR_MS = 3_600_000;

export type PostTimingClass =
  | 'ruim_vooraf' // meer voorsprong dan het optimale bereik
  | 'optimaal' // binnen het optimale bereik
  | 'onder_optimaal' // korter dan optimaal: zo snel mogelijk, met urgentie
  | 'onder_minimum'; // te laat voor dit kanaal

export interface PostPlan {
  /** ISO (UTC) van het plaatsmoment; null als het kanaal overgeslagen moet worden. */
  scheduledFor: string | null;
  classification: PostTimingClass;
  /** Voeg urgentie-taal toe aan de tekst ("vanavond nog"). */
  urgencyInCopy: boolean;
  /** Dit kanaal overslaan: te laat. */
  skip: boolean;
  /** Uitleg voor scheduled_reasoning. */
  reasoning: string;
}

/** De beginuren van de beste vensters van een kanaal, bv. ['12:00-13:00'] geeft [12]. */
function bestStartHours(channel: FillyChannel): number[] {
  return CHANNEL_RULES[channel].bestTimes.bestHours
    .map((w) => parseInt(w.split('-')[0].split(':')[0], 10))
    .filter((h) => Number.isFinite(h))
    .sort((a, b) => a - b);
}

/**
 * Plan het plaatsmoment voor één kanaal.
 * @param windowStart begin van het voorgestelde tijdvenster (ISO, UTC)
 * @param now nu
 * @param approvalBufferHours tijd die de eigenaar nodig heeft om goed te keuren
 */
export function planPostTime(
  channel: FillyChannel,
  windowStart: string,
  now: Date,
  approvalBufferHours = 1,
): PostPlan {
  const rules = CHANNEL_RULES[channel].leadTime;
  const [optMin, optMax] = rules.optimalRangeHours;
  const w = Date.parse(windowStart);
  const hoursUntil = (w - now.getTime()) / HOUR_MS;

  // Vroegste moment waarop de eigenaar het kan hebben goedgekeurd, en het
  // laatste moment waarop plaatsen nog zin heeft.
  const earliest = now.getTime() + approvalBufferHours * HOUR_MS;
  const latestAllowed = w - rules.minHours * HOUR_MS;
  if (latestAllowed < earliest) {
    return {
      scheduledFor: null,
      classification: 'onder_minimum',
      urgencyInCopy: false,
      skip: true,
      reasoning: `Overgeslagen: dit kanaal heeft minimaal ${rules.minHours} uur voorsprong nodig (${Math.max(0, hoursUntil).toFixed(1)} uur beschikbaar). ${rules.rationale}`,
    };
  }

  // Liefst zo laat mogelijk binnen het optimale bereik, nooit later dan het
  // vroegste-inplanning-moment.
  const upper = Math.min(w - optMin * HOUR_MS, latestAllowed);

  // Kandidaten: het begin van elk beste venster, op de dagen rond `upper`.
  const starts = bestStartHours(channel);
  const spanDays = Math.ceil(optMax / 24) + 2;
  let best: number | null = null;
  for (let back = 0; back <= spanDays; back++) {
    const day = todayNl(new Date(upper - back * 24 * HOUR_MS));
    for (const h of starts) {
      const t = Date.parse(amsterdamIsoAtHour(day, h));
      if (t <= upper && t >= earliest && (best === null || t > best)) best = t;
    }
    if (best !== null) break; // de dichtstbijzijnde dag met een geschikt venster
  }

  if (best !== null) {
    const hoursBefore = (w - best) / HOUR_MS;
    const classification: PostTimingClass =
      hoursBefore > optMax ? 'ruim_vooraf' : 'optimaal';
    return {
      scheduledFor: new Date(best).toISOString(),
      classification,
      urgencyInCopy: false,
      skip: false,
      reasoning: `Geplaatst ${Math.round(hoursBefore)} uur vóór het moment, aan het begin van een beste venster voor dit kanaal.`,
    };
  }

  // Geen beste venster meer haalbaar: zo snel mogelijk, aan het volgende hele uur.
  const asap = Math.ceil(earliest / HOUR_MS) * HOUR_MS;
  const when = Math.min(asap, latestAllowed);
  return {
    scheduledFor: new Date(when).toISOString(),
    classification: 'onder_optimaal',
    urgencyInCopy: true,
    skip: false,
    reasoning: `Weinig tijd (${Math.max(0, hoursUntil).toFixed(1)} uur, optimaal is ${optMin} tot ${optMax} uur): zo snel mogelijk geplaatst, met urgentie in de tekst.`,
  };
}
