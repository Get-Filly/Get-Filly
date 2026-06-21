// ============================================================
// hour-heatmap.ts, gedeelde half-uur-heatmap helpers
// ============================================================
// Gebruikt door:
//   - dashboard/_components/hour-heatmap.tsx (render)
//   - dashboard/_components/calendar-card.tsx (dag + week view)
//
// Idee: één visuele taal voor "bezetting per half-uur" op het
// dashboard. Kleur-palette matched 1-op-1 met de maand-view-cellen
// (lvl-0 t/m lvl-4 zoals in dashboard.css), zodat een dag in alle
// views dezelfde visuele drukte-indicator krijgt.

// Half-uur slots op een typische horeca-dag. Lunch 11:00-15:30,
// tussen-de-diensten-gap 16:00-16:30, diner 17:00-22:30. 22 cellen
// totaal. Een dichte zaak die alleen diner doet ziet de lunch-cellen
// gewoon licht uitvallen (0%); een zaak die alleen lunch doet ziet
// dezelfde dynamiek omgekeerd.
export const HALF_HOUR_SLOTS = [
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
  "20:30",
  "21:00",
  "21:30",
  "22:00",
  "22:30",
] as const;

// Hele-uur labels voor in de heatmap-header. Elk label spant 2 half-
// uur cellen via grid-column-span. 11 labels = 22 cellen.
export const HOUR_HEADERS = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
] as const;

// ------------------------------------------------------------
// Tier-kleuren, matched 1-op-1 met dashboard.css .cal-cell.lvl-X
// ------------------------------------------------------------
// Bij wijziging hier OF in dashboard.css, beide locaties bijwerken.
// Of: later refactoren naar CSS-variabelen zodat één source-of-truth.
export function occupancyTier(pct: number): 0 | 1 | 2 | 3 | 4 {
  if (pct < 40) return 0;
  if (pct < 65) return 1;
  if (pct < 80) return 2;
  if (pct < 95) return 3;
  return 4;
}

const TIER_BACKGROUNDS = [
  "rgba(192, 70, 60, 0.32)", // lvl-0, rood-soft (<40%)
  "rgba(208, 110, 65, 0.26)", // lvl-1, oranje-soft (40-65%)
  "rgba(217, 150, 70, 0.30)", // lvl-2, koper-soft (65-80%)
  "rgba(45, 90, 63, 0.32)", // lvl-3, groen-soft (80-95%)
  "rgba(31, 74, 45, 0.42)", // lvl-4, groen-vol (95+%)
] as const;

export function tierBackground(pct: number): string {
  return TIER_BACKGROUNDS[occupancyTier(pct)];
}

// Tekst-kleur in de cel. Alle tiers gebruiken (--text) want de alpha-
// schaling van de achtergrond is dusdanig dat donkere tekst altijd
// leesbaar blijft. Aparte helper voor het geval we 't later willen
// differentiëren (bv. wit op lvl-4).
export function tierTextColor(_pct: number): string {
  return "var(--text)";
}

// ------------------------------------------------------------
// Mock-hourly distribution voor één dag (22 half-uur slots)
// ------------------------------------------------------------
// Lunch-piek 12:00-14:00, diner-piek 18:30-20:30. Tussen-de-diensten
// blijft licht. dayIdx geeft deterministische jitter zodat dagen niet
// allemaal exact hetzelfde uur-patroon tonen.
//
// Vervang door echte data zodra reserveringsplatform-integraties
// (Zenchef etc) per-restaurant half-uur-aggregaten leveren.
export function hourlyForDay(dayPct: number, dayIdx: number): number[] {
  // Baseline-distributie matched met de typische horeca-flow,
  // per half-uur. 22 waardes, alignt met HALF_HOUR_SLOTS.
  // Lunch: 11:00=15, 11:30=35, 12:00=70, 12:30=85, 13:00=85, 13:30=75
  // 14:00=55, 14:30=30, 15:00=20, 15:30=15
  // Diner: 17:00=25, 17:30=45, 18:00=70, 18:30=85, 19:00=95
  // 19:30=95, 20:00=85, 20:30=70, 21:00=50, 21:30=35, 22:00=25, 22:30=15
  const baseline = [
    15, 35, 70, 85, 85, 75, 55, 30, 20, 15, 25, 45, 70, 85, 95, 95, 85, 70,
    50, 35, 25, 15,
  ];
  return baseline.map((b, i) => {
    // Anchor: schaal baseline rond dayPct (50 = ongemoeid).
    const scaled = b * (dayPct / 50);
    // Deterministische jitter ±5%.
    const jitter = ((dayIdx * 3 + i * 7) % 11) - 5;
    return Math.max(0, Math.min(100, Math.round(scaled + jitter)));
  });
}

// ------------------------------------------------------------
// Per-tafel-type mock-distribution (dag-view)
// ------------------------------------------------------------
// Voor de dag-view tonen we 5 rijen: bar + 4 tafel-groottes. Elk
// tafel-type heeft z'n eigen typische bezetting-shape:
//   - Bar: borrel-piek 17-19u + late drinks 21-22u
//   - 2 pers.: romantisch diner-zwaartepunt 19-21u, lunch 12-14u
//   - 4 pers.: hoofd-diner 18-20u, weekend-lunch
//   - 6 pers.: weekend-diner 19-21u, doordeweeks lichter
//   - 6+ pers.: groepsreserveringen 18-21u (zelden lunch)
// Mock tot reserveringsplatform-integraties echte per-tafel-data
// leveren via een tables-bezetting-endpoint.

export type TableType = "bar" | "t2" | "t4" | "t6" | "t6plus";

export const TABLE_TYPES: readonly TableType[] = [
  "bar",
  "t2",
  "t4",
  "t6",
  "t6plus",
] as const;

export const TABLE_LABELS: Record<TableType, string> = {
  bar: "Bar",
  t2: "2 pers.",
  t4: "4 pers.",
  t6: "6 pers.",
  t6plus: "6+ pers.",
};

// 22 half-uur waardes per tafel-type. Bedoeld als TYPISCH patroon,
// schaalt rond dayPct (50% = baseline ongemoeid, 100% = ~2× hoger
// gecapped, 0% = bijna leeg).
const TABLE_BASELINES: Record<TableType, number[]> = {
  // Bar: rustig overdag, opbouwend vanaf borrel-uur, twee pieken
  // (17-19 borrel, 20-22 late drinks).
  bar: [
    20, 25, 30, 35, 40, 45, 40, 30, 25, 25, 50, 70, 80, 75, 70, 65, 75, 80,
    85, 75, 60, 40,
  ],
  // 2-pers.: lunch (12-14) + diner-zwaartepunt 19-20. Romantisch-segment.
  t2: [
    10, 25, 60, 80, 80, 70, 50, 25, 15, 10, 20, 40, 70, 85, 90, 90, 85, 70,
    55, 40, 30, 20,
  ],
  // 4-pers.: hoofd-diner-segment, gezinnen + groepjes. Stevige lunch ook.
  t4: [
    15, 30, 70, 90, 90, 80, 60, 35, 20, 15, 25, 45, 75, 90, 95, 95, 85, 65,
    45, 30, 20, 10,
  ],
  // 6-pers.: weekend-diner-zwaartepunt, doordeweeks lichter.
  t6: [
    5, 15, 40, 65, 65, 55, 35, 20, 10, 5, 15, 30, 55, 80, 95, 95, 85, 60,
    35, 20, 10, 5,
  ],
  // 6+ pers.: groeps-reserveringen, primair diner. Lunch zeldzaam.
  t6plus: [
    5, 10, 25, 50, 50, 45, 30, 15, 10, 5, 10, 20, 45, 75, 90, 95, 80, 50,
    25, 10, 5, 0,
  ],
};

export function hourlyForTable(
  dayPct: number,
  table: TableType,
  dayIdx: number,
): number[] {
  const baseline = TABLE_BASELINES[table];
  return baseline.map((b, i) => {
    const scaled = b * (dayPct / 50);
    // Jitter-seed combineert dayIdx + table-letter-code zodat
    // elke tafel-rij een eigen lichte variatie krijgt (anders
    // schalen alle rijen exact gelijk en oogt 't synthetisch).
    const tableSeed = table.charCodeAt(0);
    const jitter = ((dayIdx * 3 + i * 7 + tableSeed) % 11) - 5;
    return Math.max(0, Math.min(100, Math.round(scaled + jitter)));
  });
}

// ------------------------------------------------------------
// Bezetting per service-periode (ontbijt/lunch/diner)
// ------------------------------------------------------------
// Voor de nieuwe dashboard week- en dag-view die werken op
// service_periods i.p.v. half-uur granulariteit. Pure mock tot
// reserveringsplatform-integraties echte per-service-aggregaten
// leveren.

export type ServiceKey = "breakfast" | "lunch" | "dinner";

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  breakfast: "Ontbijt",
  lunch: "Lunch",
  dinner: "Diner",
};

// Multipliers t.o.v. de overall dag-bezetting. Diner is in de meeste
// horeca-zaken het zwaartepunt → hoogste multiplier. Ontbijt licht
// gemiddeld (alleen weekend-ontbijt is gemiddeld minder vol dan
// diner). Lunch tussenin.
const SERVICE_DAY_MULTIPLIER: Record<ServiceKey, number> = {
  breakfast: 0.55,
  lunch: 0.85,
  dinner: 1.15,
};

// Per (tafel-type × service) een baseline-multiplier. Bar = avond/borrel-
// zwaartepunt. Grote tafels = diner-zwaartepunt. 2-pers tafels = lunch
// + diner.
const TABLE_SERVICE_MULTIPLIER: Record<TableType, Record<ServiceKey, number>> = {
  bar: { breakfast: 0.2, lunch: 0.55, dinner: 1.25 },
  t2: { breakfast: 0.5, lunch: 0.95, dinner: 1.1 },
  t4: { breakfast: 0.55, lunch: 1.0, dinner: 1.15 },
  t6: { breakfast: 0.3, lunch: 0.7, dinner: 1.2 },
  t6plus: { breakfast: 0.2, lunch: 0.55, dinner: 1.3 },
};

// Dag-bezetting per service voor een gegeven dag-overall-percentage.
// Wordt gebruikt in de week-view-heatmap (7 rijen × N services).
export function occupancyForServiceOnDay(
  dayPct: number,
  service: ServiceKey,
  dayIdx: number,
): number {
  const multiplier = SERVICE_DAY_MULTIPLIER[service];
  const scaled = dayPct * multiplier;
  const jitter = ((dayIdx * 5 + service.charCodeAt(0) * 3) % 9) - 4;
  return Math.max(0, Math.min(100, Math.round(scaled + jitter)));
}

// Tafel-bezetting per service voor een gegeven dag-overall-percentage.
// Wordt gebruikt in de dag-view-heatmap (5 tafels × N services).
export function occupancyForTableService(
  dayPct: number,
  table: TableType,
  service: ServiceKey,
  dayIdx: number,
): number {
  const baseMultiplier = TABLE_SERVICE_MULTIPLIER[table][service];
  const scaled = dayPct * baseMultiplier;
  const jitter =
    ((dayIdx * 3 + table.charCodeAt(0) + service.charCodeAt(0) * 2) % 11) - 5;
  return Math.max(0, Math.min(100, Math.round(scaled + jitter)));
}

// Welke services zijn actief voor een specifieke datum, op basis van
// restaurant.service_periods. Een dag is "actief" voor een service
// als de dag-key in service_periods[service] niet null is. Returnt
// services in vaste volgorde (breakfast → lunch → dinner) zodat de
// UI-kolommen consistent zijn.
export function activeServicesForDate(
  servicePeriods:
    | { [key: string]: { [day: string]: unknown } | undefined }
    | null
    | undefined,
  date: Date,
): ServiceKey[] {
  if (!servicePeriods) return ["lunch", "dinner"]; // sensible fallback
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = weekdayKeys[date.getDay()];
  const services: ServiceKey[] = ["breakfast", "lunch", "dinner"];
  return services.filter((s) => {
    const dayConfig = servicePeriods[s]?.[dayKey];
    return dayConfig != null;
  });
}

// ------------------------------------------------------------
// Tijden-formatting voor heatmap-headers
// ------------------------------------------------------------
type ServicePeriodsLike =
  | {
      [key: string]: {
        [day: string]: {
          start: string;
          end: string;
          session_count: number;
        } | null | undefined;
      } | undefined;
    }
  | null
  | undefined;

// Tijden voor 1 specifieke dag voor 1 service. Bv. "09:00 – 11:30 · 1 shift".
// Null als de service niet actief is voor die dag.
export function serviceTimesForDay(
  servicePeriods: ServicePeriodsLike,
  service: ServiceKey,
  date: Date,
): string | null {
  if (!servicePeriods) return null;
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = weekdayKeys[date.getDay()];
  const dayConfig = servicePeriods[service]?.[dayKey];
  if (!dayConfig) return null;
  const shiftLabel =
    dayConfig.session_count === 1
      ? "1 shift"
      : `${dayConfig.session_count} shifts`;
  return `${dayConfig.start} – ${dayConfig.end} · ${shiftLabel}`;
}

// Representatieve tijden voor een service over een rij dagen (week-
// view). Pakt de meest-voorkomende combinatie van start/eind/shifts.
// Geeft null terug wanneer geen enkele dag actief is voor deze service.
export function serviceTimesForRange(
  servicePeriods: ServicePeriodsLike,
  service: ServiceKey,
  dates: Date[],
): string | null {
  if (!servicePeriods) return null;
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const counts = new Map<
    string,
    { config: { start: string; end: string; session_count: number }; count: number }
  >();
  for (const d of dates) {
    const dayKey = weekdayKeys[d.getDay()];
    const dayConfig = servicePeriods[service]?.[dayKey];
    if (!dayConfig) continue;
    const sig = `${dayConfig.start}|${dayConfig.end}|${dayConfig.session_count}`;
    const existing = counts.get(sig);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(sig, { config: dayConfig, count: 1 });
    }
  }
  if (counts.size === 0) return null;
  // Pak de combinatie met de hoogste count.
  let best: { config: { start: string; end: string; session_count: number }; count: number } | null =
    null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }
  if (!best) return null;
  const shiftLabel =
    best.config.session_count === 1
      ? "1 shift"
      : `${best.config.session_count} shifts`;
  return `${best.config.start} – ${best.config.end} · ${shiftLabel}`;
}
