// Mock-datasets voor de grafiek in dag- en jaar-weergave.
// Vervangen door backend-data later.

const weekdayLabels = ["Zondagen", "Maandagen", "Dinsdagen", "Woensdagen", "Donderdagen", "Vrijdagen", "Zaterdagen"];

// JS getDay(): 0=zo, 1=ma, ...
export function weekdayLabel(jsDay: number): string {
  return weekdayLabels[jsDay];
}

/** 26 weken historie (± 6 maanden) voor een specifieke weekdag. */
export function getWeekdayHistory(jsDay: number): number[] {
  const mondayIdx = (jsDay + 6) % 7; // 0=ma, 6=zo
  const out: number[] = [];
  for (let i = 0; i < 26; i++) {
    const seed = (i * 19 + jsDay * 7) % 100;
    let v: number;
    if (mondayIdx >= 4) v = 75 + (seed % 22);
    else if (mondayIdx === 3) v = 55 + (seed % 25);
    else v = 42 + (seed % 28);
    out.push(v);
  }
  return out;
}

/** 12 maanden gemiddelde bezetting. */
export function getYearMonthlyAverages(year: number): number[] {
  // Baseline: zomers hoger, winters lager (seizoensinvloed horeca)
  const baseline = [56, 54, 60, 66, 72, 78, 82, 80, 74, 66, 58, 64];
  return baseline.map((b, m) => {
    const seed = (m * 13 + (year % 100) * 3) % 10;
    return b + seed - 5;
  });
}
