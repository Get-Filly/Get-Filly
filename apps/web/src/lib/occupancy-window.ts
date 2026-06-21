// ============================================================
// occupancy-window.ts, gedeelde helpers voor "wat is een rustige dag?"
// ============================================================
// Gebruikt door:
//   - dashboard/page.tsx (rode strook + popover-data)
//
// Twee helpers die samen één consistent antwoord geven:
//   1. buildWindowOccupancy: vult een 14-daagse window met real data
//      waar beschikbaar, anders deterministische seededOccupancy-
//      fallback (zelfde getallen als de kalender op het dashboard
//      laat zien, zodat eigenaar niet 2 verschillende percentages
//      ziet voor dezelfde dag).
//   2. isOpenOn: respecteert closed_dates + opening_hours. Cruciaal:
//      ontbrekende opening_hours-keys → "assume open", anders
//      filtert deze code een nieuw restaurant (zonder ingevulde
//      openingstijden) z'n hele week weg.

import type { OccupancyDay, Restaurant } from "./api";
import {
  seededOccupancy,
  mondayIndex,
} from "../app/[locale]/dashboard/_lib/calendar-data";

// Mapping van JS-weekday (0=zondag) naar opening_hours-key.
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Bouw een 14-daagse window (vanaf morgen, today+1 t/m today+14)
// met real data waar beschikbaar, anders seededOccupancy-fallback.
//
// Window start op morgen omdat een "rustige dag vandaag" niet meer
// te activeren is via een campagne.
// seedMissing: vul dagen zónder echte bezettingsdata met de seeded-
// fallback (demo). Default true voor bestaande callers (dashboard-grid).
// De geleide flow + UpcomingActionsBlock geven `false` mee: liever géén
// verzonnen "rustige dagen" dan nep-percentages (Floris-feedback
// 2026-06-13). Bij `false` bevat de output alleen dagen mét echte data.
export function buildWindowOccupancy(
  realData: OccupancyDay[],
  fromDate: Date,
  days: number,
  seedMissing = true,
): OccupancyDay[] {
  const realByDate = new Map(realData.map((d) => [d.date, d]));
  const out: OccupancyDay[] = [];

  for (let i = 1; i <= days; i++) {
    const d = new Date(fromDate);
    d.setDate(fromDate.getDate() + i);
    const dateStr = toIso(d);
    const real = realByDate.get(dateStr);
    if (real) {
      out.push(real);
      continue;
    }
    if (!seedMissing) continue; // eerlijk: geen nep-bezetting
    // Fallback: zelfde seeded-getallen als de kalender. mondayIndex
    // converteert JS-weekday (0=zo) naar onze ma-start-grid (0=ma).
    const pct = seededOccupancy(d.getDate(), mondayIndex(d.getDay()));
    out.push({
      date: dateStr,
      occupancy_pct: pct,
      estimated_guests: 0,
      estimated_revenue_cents: 0,
    });
  }

  return out;
}

// Bepaalt of het restaurant open is op een specifieke datum.
// Returns true als:
//   - datum NIET in closed_dates
//   - opening_hours-key voor die weekdag NIET expliciet null
// Returns true ook als opening_hours leeg is OF de weekdag-key mist —
// "geen info" interpreteren we als "open". Dat is gunstiger dan
// alles verbergen voor restaurants die hun openingstijden nog niet
// hebben ingevuld.
export function isOpenOn(
  restaurant: Pick<Restaurant, "closed_dates" | "opening_hours"> | null,
  date: string,
): boolean {
  if (!restaurant) return true; // geen restaurant geladen, niet filteren

  if ((restaurant.closed_dates ?? []).includes(date)) return false;

  const hours = restaurant.opening_hours;
  if (!hours || Object.keys(hours).length === 0) {
    // Geen openingstijden ingevuld → assume open (i.p.v. alles
    // wegfilteren wat een onbedoelde "leeg-dashboard"-bug oplevert).
    return true;
  }
  const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00`).getDay()];
  const dayHours = hours[weekday];
  // null = expliciet gesloten op deze weekdag.
  if (dayHours === null) return false;
  // undefined = key niet aanwezig → assume open.
  return true;
}
