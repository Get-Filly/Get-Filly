import {
  parsePopularTimes,
  parseWorkingHours,
  type BusynessPattern,
} from './outscraper.parser';
import barBarolo from './__fixtures__/bar-barolo.json';

// De fixture is een ECHTE Outscraper-pull (Bar Barolo, Amsterdam,
// 2026-07-15) — zo weten we dat de mapping op productie-data klopt.

describe('parsePopularTimes (echte Bar Barolo-pull)', () => {
  const parsed = parsePopularTimes(barBarolo.popular_times);
  const pattern = parsed.pattern as BusynessPattern;

  it('levert een gevuld 7x24 raster', () => {
    expect(pattern).not.toBeNull();
    expect(pattern).toHaveLength(7);
    for (const day of pattern) expect(day).toHaveLength(24);
  });

  it('mapt dag-nummers correct: 1=maandag (idx 0), 7=zondag (idx 6)', () => {
    // Maandag: piek om 17u = 100, 16u = 97, 14u = 83, 12u = 55.
    expect(pattern[0][17]).toBe(100);
    expect(pattern[0][16]).toBe(97);
    expect(pattern[0][14]).toBe(83);
    expect(pattern[0][12]).toBe(55);
    // Zondag: 19u = 55, 20u = 58, 12u = 30.
    expect(pattern[6][19]).toBe(55);
    expect(pattern[6][20]).toBe(58);
    expect(pattern[6][12]).toBe(30);
    // Dinsdag (idx 1): 16u = 19.
    expect(pattern[1][16]).toBe(19);
  });

  it('pad ontbrekende uren 0-5 met 0 voor elke dag', () => {
    for (const day of pattern) {
      for (let h = 0; h <= 5; h++) expect(day[h]).toBe(0);
    }
  });

  it('leest de live-drukte uit het laatste element', () => {
    expect(parsed.livePct).toBe(25);
    expect(parsed.liveHour).toBe(12);
  });

  it('accepteert zowel een JSON-string als een al-geparsed array', () => {
    const asString = parsePopularTimes(JSON.stringify(barBarolo.popular_times));
    expect(asString.pattern).toEqual(pattern);
    expect(asString.livePct).toBe(25);
  });
});

describe('parsePopularTimes (randgevallen)', () => {
  it('geeft pattern=null als er geen dag-data is (kleine zaak)', () => {
    expect(parsePopularTimes([]).pattern).toBeNull();
    expect(parsePopularTimes('').pattern).toBeNull();
    expect(parsePopularTimes(null).pattern).toBeNull();
    expect(parsePopularTimes('geen-json').pattern).toBeNull();
  });

  it('leest live ook als er geen weekpatroon is', () => {
    const r = parsePopularTimes([{ day: 'live', percentage: 40, time: 19 }]);
    expect(r.pattern).toBeNull();
    expect(r.livePct).toBe(40);
    expect(r.liveHour).toBe(19);
  });

  it('clamp percentages naar 0-100', () => {
    const r = parsePopularTimes([
      { day: 1, popular_times: [{ hour: 12, percentage: 150 }, { hour: 13, percentage: -5 }] },
    ]);
    expect(r.pattern![0][12]).toBe(100);
    expect(r.pattern![0][13]).toBe(0);
  });
});

describe('parseWorkingHours (echte Bar Barolo-pull)', () => {
  const oh = parseWorkingHours(barBarolo.working_hours)!;

  it('zet "12:15pm-12am" om naar 24u open/close per dag', () => {
    // 12:15pm -> 12:15 ; 12am (middernacht) -> 00:00
    expect(oh.mon).toEqual({ open: '12:15', close: '00:00' });
    expect(oh.sun).toEqual({ open: '12:15', close: '00:00' });
  });

  it('gebruikt onze dagsleutels (mon..sun)', () => {
    expect(Object.keys(oh).sort()).toEqual(
      ['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed'].sort(),
    );
  });

  it('am/pm-conversie: 9am->09:00, 12pm->12:00, gesloten->null', () => {
    const r = parseWorkingHours({
      Monday: ['9am-11:30pm'],
      Tuesday: ['12pm-2pm'],
      Wednesday: ['Closed'],
      Thursday: [],
    })!;
    expect(r.mon).toEqual({ open: '09:00', close: '23:30' });
    expect(r.tue).toEqual({ open: '12:00', close: '14:00' });
    expect(r.wed).toBeNull();
    expect(r.thu).toBeNull();
  });
});
