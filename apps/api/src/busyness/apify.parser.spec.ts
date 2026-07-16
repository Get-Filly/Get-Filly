import { parseApifyPlace, type BusynessPattern } from './apify.parser';
import barBarolo from './__fixtures__/bar-barolo-apify.json';

// De fixture is een ECHTE Apify-pull (Bar Barolo, 2026-07-16), zodat we
// weten dat de mapping op productie-data klopt.

describe('parseApifyPlace (echte Bar Barolo-pull)', () => {
  const parsed = parseApifyPlace(barBarolo);
  const pattern = parsed.pattern as BusynessPattern;

  it('levert een gevuld 7x24 raster', () => {
    expect(pattern).not.toBeNull();
    expect(pattern).toHaveLength(7);
    for (const day of pattern) expect(day).toHaveLength(24);
  });

  it('mapt Apify-dagsleutels: Mo=idx0 (piek), Su=idx6', () => {
    // Maandag: 17u = 100 (piek), 16u = 97, 12u = 55.
    expect(pattern[0][17]).toBe(100);
    expect(pattern[0][16]).toBe(97);
    expect(pattern[0][12]).toBe(55);
    // Zondag (idx 6): 19u = 55, 20u = 58.
    expect(pattern[6][19]).toBe(55);
    expect(pattern[6][20]).toBe(58);
  });

  it('pad ontbrekende uren 0-5 met 0', () => {
    for (const day of pattern) {
      for (let h = 0; h <= 5; h++) expect(day[h]).toBe(0);
    }
  });

  it('leest live-drukte (getal, ook 0)', () => {
    // De fixture is gepulld op een rustig middagmoment: live = 0.
    expect(parsed.livePct).toBe(0);
  });

  it('zet openingstijden om naar 24u (12:15 PM to 12 AM)', () => {
    expect(parsed.openingHours?.mon).toEqual({ open: '12:15', close: '00:00' });
    expect(Object.keys(parsed.openingHours ?? {}).sort()).toEqual(
      ['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed'].sort(),
    );
  });
});

describe('parseApifyPlace (randgevallen)', () => {
  it('geen histogram -> pattern null', () => {
    expect(parseApifyPlace({}).pattern).toBeNull();
    expect(parseApifyPlace({ popularTimesHistogram: null }).pattern).toBeNull();
  });

  it('livePct null als er geen live-getal is', () => {
    expect(parseApifyPlace({ popularTimesLivePercent: null }).livePct).toBeNull();
    expect(parseApifyPlace({}).livePct).toBeNull();
  });

  it('live = 0 blijft 0 (echte rustige meting, niet null)', () => {
    expect(parseApifyPlace({ popularTimesLivePercent: 0 }).livePct).toBe(0);
  });

  it('clamp + AM/PM-conversie + gesloten', () => {
    const r = parseApifyPlace({
      popularTimesHistogram: {
        Mo: [
          { hour: 12, occupancyPercent: 150 },
          { hour: 13, occupancyPercent: -5 },
        ],
      },
      openingHours: [
        { day: 'Monday', hours: '9 AM to 11:30 PM' },
        { day: 'Tuesday', hours: '12 PM to 2 PM' },
        { day: 'Wednesday', hours: 'Closed' },
      ],
    });
    expect(r.pattern![0][12]).toBe(100);
    expect(r.pattern![0][13]).toBe(0);
    expect(r.openingHours?.mon).toEqual({ open: '09:00', close: '23:30' });
    expect(r.openingHours?.tue).toEqual({ open: '12:00', close: '14:00' });
    expect(r.openingHours?.wed).toBeNull();
  });
});
