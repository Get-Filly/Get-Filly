// Deterministische mock-data voor de kalender. Vervangen door backend-data later.

export type CampaignMark = "mail" | "social";

export type DayData = {
  day: number;
  occupancy: number; // 0-100
  campaigns: CampaignMark[];
};

// Geeft een deterministisch "realistisch" bezettings% terug per weekdag.
// weekday: 0=ma, 1=di, ..., 6=zo
// Geëxporteerd zodat de week-view in calendar-card.tsx exact dezelfde
// fallback kan gebruiken als de maand-view; anders zien dezelfde dagen
// er anders uit per view.
export function seededOccupancy(day: number, weekday: number): number {
  const seed = (day * 37 + weekday * 11) % 100;
  if (weekday >= 4) return 78 + (seed % 22); // vr/za/zo: 78-99
  if (weekday === 3) return 55 + (seed % 25); // do: 55-79
  return 40 + (seed % 30); // ma/di/wo: 40-69
}

function seededCampaigns(day: number): CampaignMark[] {
  const out: CampaignMark[] = [];
  if (day % 7 === 3 || day === 17) out.push("mail");
  if (day % 11 === 4 || day === 25) out.push("social");
  return out;
}

/** JS Date.getDay(): 0=zo, 1=ma, ..., 6=za. Onze grid start op ma, dus: */
export function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function getMonthData(year: number, month: number) {
  // month is 0-indexed (0=januari)
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = mondayIndex(firstDay.getDay());

  const cells: (DayData | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = mondayIndex(new Date(year, month, d).getDay());
    cells.push({
      day: d,
      occupancy: seededOccupancy(d, weekday),
      campaigns: seededCampaigns(d),
    });
  }

  return cells;
}

/**
 * Zelfde als getMonthData, maar vervangt bezetting waar real data
 * beschikbaar is uit de backend. Mock blijft als fallback.
 */
export function mergeMonthData(
  year: number,
  month: number,
  realData: { date: string; occupancy_pct: number }[],
) {
  const cells = getMonthData(year, month);
  const byDay = new Map<number, number>();
  for (const d of realData) {
    const dayNum = parseInt(d.date.slice(8, 10), 10);
    byDay.set(dayNum, d.occupancy_pct);
  }
  return cells.map((cell) => {
    if (!cell) return cell;
    const realPct = byDay.get(cell.day);
    if (realPct === undefined) return cell;
    return { ...cell, occupancy: realPct };
  });
}

export function occupancyClass(pct: number): "pg" | "po" | "pr" {
  if (pct >= 80) return "pg";
  if (pct >= 50) return "po";
  return "pr";
}

export const maandenNL = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
