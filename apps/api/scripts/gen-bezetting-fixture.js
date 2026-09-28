/**
 * Fixture voor /proto-bezetting: draait de ECHTE aggregatie
 * (aggregateOccupancyReport) op een synthetische reeks live-metingen, zodat
 * het prototype algoritme-output toont en geen met de hand verzonnen JSON.
 *
 * Gebruik (vanuit apps/api): npx nest build && node scripts/gen-bezetting-fixture.js
 */
const path = require('path');
const fs = require('fs');
const { aggregateOccupancyReport } = require(
  path.join(__dirname, '../dist/busyness/busyness.service'),
);

// Bistro: di t/m zo open, lunch 12-14 en diner 17-21. Maandag dicht.
const LUNCH = [0, 30, 28, 36, 44, 58, 66];
const DINER = [0, 40, 44, 50, 68, 88, 72];

function patroon() {
  const p = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (let d = 1; d < 7; d++) {
    for (let h = 12; h <= 13; h++) p[d][h] = LUNCH[d];
    p[d][14] = Math.round(LUNCH[d] * 0.6);
    for (let h = 17; h <= 20; h++) p[d][h] = DINER[d];
  }
  return p;
}

// 16 weken uurlijkse metingen. De werkelijkheid blijft bij de verwachting
// achter op di/wo-lunch en loopt voor op za-diner — precies het soort
// bevinding waar het blok voor bedoeld is.
function metingen() {
  const rows = [];
  const p = patroon();
  const start = new Date(Date.UTC(2026, 4, 26)); // dinsdag
  for (let d = 0; d < 112; d++) {
    const dag = new Date(start);
    dag.setUTCDate(start.getUTCDate() + d);
    const iso = dag.toISOString().slice(0, 10);
    const wd = (dag.getUTCDay() + 6) % 7;
    if (wd === 0) continue; // maandag dicht
    for (let h = 0; h < 24; h++) {
      const verwacht = p[wd][h];
      if (verwacht <= 0) continue;
      let afwijking = 0;
      if ((wd === 1 || wd === 2) && h <= 14) afwijking = -13; // stille lunch
      if (wd === 5 && h >= 17) afwijking = 9; // druk zaterdagdiner
      const ruis = ((d * 7 + h * 5) % 11) - 5;
      rows.push({
        captured_at: `${iso}T${String(Math.max(0, h - 2)).padStart(2, '0')}:10:00Z`,
        live_pct: Math.max(0, Math.min(100, verwacht + afwijking + ruis)),
        live_hour: h,
      });
    }
  }
  return rows;
}

const MIN_DAYS = 3;
const { hourly, dayparts } = aggregateOccupancyReport(metingen(), patroon(), MIN_DAYS);
const out = {
  _comment:
    'Gegenereerd door apps/api/scripts/gen-bezetting-fixture.js met de echte aggregatie. Niet met de hand bijwerken.',
  hasSource: true,
  weeks: 16,
  minDays: MIN_DAYS,
  hourly,
  dayparts,
};
const dest = path.join(
  __dirname,
  '../../web/src/app/[locale]/proto-bezetting/fixture.json',
);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`geschreven: ${dest}`);
console.log(`${hourly.length} uur-cellen, ${dayparts.length} dagdeel-rijen`);
