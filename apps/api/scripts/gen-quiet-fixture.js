/**
 * Genereert de fixture voor het kansen-prototype (/proto-kansen).
 *
 * Draait de ECHTE BusynessService.getQuietMoments tegen een testpatroon, zodat
 * het prototype algoritme-output toont en geen met de hand verzonnen JSON. De
 * DB-lezingen en de weer/event-bronnen worden hier gestubd; verder is het
 * dezelfde code die in productie draait.
 *
 * Gebruik (vanuit apps/api):
 *   npx nest build && node scripts/gen-quiet-fixture.js
 */
const path = require('path');
const fs = require('fs');

const {
  BusynessService,
} = require(path.join(__dirname, '../dist/busyness/busyness.service'));

// ------------------------------------------------------------
// Testpatroon: bistro, dinsdag t/m zondag open. Lunch 12-15, diner 17-22.
// Weekend druk, begin van de week stil. Maandag dicht.
// ------------------------------------------------------------
const LUNCH = [0, 22, 20, 30, 38, 55, 62]; // ma..zo
const DINER = [0, 38, 42, 48, 66, 88, 70];

function makePattern() {
  const p = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (let d = 1; d < 7; d++) {
    for (let h = 12; h <= 14; h++) p[d][h] = LUNCH[d];
    p[d][15] = Math.round(LUNCH[d] * 0.5);
    p[d][16] = Math.round(LUNCH[d] * 0.6);
    for (let h = 17; h <= 21; h++) p[d][h] = DINER[d];
  }
  return p;
}

const OPENING_HOURS = {
  mon: null,
  tue: { open: '12:00', close: '22:00' },
  wed: { open: '12:00', close: '22:00' },
  thu: { open: '12:00', close: '22:00' },
  fri: { open: '12:00', close: '22:00' },
  sat: { open: '12:00', close: '22:00' },
  sun: { open: '12:00', close: '22:00' },
};

// ------------------------------------------------------------
// Datum-signalen voor het venster. Bewust een paar sprekende gevallen:
// regen in de eerste week (binnen de 7-daagse weerhorizon), een festival
// vlakbij, en een dag die al is afgedekt.
// ------------------------------------------------------------
function iso(d) {
  return d.toISOString().slice(0, 10);
}
const today = new Date();
const from = iso(today);
const to = iso(new Date(today.getTime() + 21 * 86400000));
const plus = (n) => iso(new Date(today.getTime() + n * 86400000));

const weatherByDate = new Map([
  [plus(2), { tempMin: 11, tempMax: 15, code: 82 }], // zware buien
  [plus(3), { tempMin: 12, tempMax: 17, code: 3 }],
  [plus(4), { tempMin: 15, tempMax: 24, code: 0 }], // terrasweer
  [plus(5), { tempMin: 9, tempMax: 13, code: 63 }], // regen
]);

const eventsByDate = new Map([
  [
    plus(9),
    [
      {
        name: 'Zomerfeest',
        category: 'festivals',
        place: 'Zutphen',
        distanceKm: 0.8,
        radiusKm: 10,
      },
    ],
  ],
  [
    plus(16),
    [
      {
        name: 'Weekmarkt',
        category: 'markten',
        place: 'Zutphen',
        distanceKm: 0.6,
        radiusKm: 2,
      },
    ],
  ],
]);

const covered = new Set([plus(7)]);

function makeService(ctx) {
  const svc = new BusynessService({}, {}, {}, {});
  svc.getLatest = async () => ({
    pattern: makePattern(),
    openingHours: OPENING_HOURS,
    livePct: null,
    liveHour: null,
    liveWeekday: null,
    capturedAt: new Date().toISOString(),
  });
  svc.getQuietWindow = async () => null;
  svc.loadQuietContext = async () => ctx;
  return svc;
}

const volleContext = {
  holidayByDate: new Map(),
  eventsByDate,
  weatherByDate,
  hasTerrace: true,
  covered,
  recentSlots: new Map(),
};

(async () => {
  const metBeleid = await makeService(volleContext).getQuietMoments(
    'proto',
    from,
    to,
    2,
  );
  // Zonder beleidslaag = het gedrag van vóór 2026-09-15: elke week dezelfde
  // weekdagen. Staat in het prototype naast elkaar zodat het verschil te zien is.
  const zonderBeleid = await makeService(volleContext).getQuietMoments(
    'proto',
    from,
    to,
    2,
    { applyPolicy: false },
  );

  const out = {
    _comment:
      'Gegenereerd door apps/api/scripts/gen-quiet-fixture.js met de echte BusynessService. Niet met de hand bijwerken.',
    generatedAt: new Date().toISOString(),
    from,
    to,
    pattern: makePattern(),
    openingHours: OPENING_HOURS,
    metBeleid,
    zonderBeleid,
  };

  const dest = path.join(
    __dirname,
    '../../web/src/app/[locale]/proto-kansen/fixture.json',
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`geschreven: ${dest}`);
  console.log(
    `met beleid: ${metBeleid.moments.length} kansen, ${metBeleid.notes.length} notes`,
  );
  console.log(`zonder beleid: ${zonderBeleid.moments.length} kansen`);
})();
