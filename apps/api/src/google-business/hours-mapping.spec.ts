import {
  businessHoursToGbpDays,
  gbpDaysToBusinessHours,
  sameJson,
} from './hours-mapping';

const WEEK = {
  mon: { open: '12:00', close: '22:00' },
  tue: null,
  wed: { open: '12:00', close: '22:00' },
  thu: { open: '12:00', close: '22:00' },
  fri: { open: '12:00', close: '01:00' },
  sat: { open: '12:00', close: '01:00' },
  sun: null,
};

describe('hours-mapping', () => {
  it('vertaalt Get-Filly-tijden naar Google-dagen', () => {
    const days = businessHoursToGbpDays(WEEK)!;
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      day: 'MONDAY',
      open: true,
      openTime: '12:00',
      closeTime: '22:00',
    });
    expect(days[1].open).toBe(false);
    expect(days[4].closeTime).toBe('01:00'); // nachtzaak blijft behouden
  });

  it('geeft null als een dag ontbreekt (niet gokken)', () => {
    const { sun: _sun, ...zonderZondag } = WEEK;
    expect(businessHoursToGbpDays(zonderZondag)).toBeNull();
  });

  it('geeft null bij een ongeldige tijd', () => {
    expect(
      businessHoursToGbpDays({ ...WEEK, mon: { open: '9:00', close: '22:00' } }),
    ).toBeNull();
    expect(
      businessHoursToGbpDays({ ...WEEK, mon: { open: '12:00', close: '24:00' } }),
    ).toBeNull();
  });

  it('geeft null bij geen tijden', () => {
    expect(businessHoursToGbpDays(null)).toBeNull();
  });

  it('heen en weer geeft dezelfde tijden terug', () => {
    expect(gbpDaysToBusinessHours(businessHoursToGbpDays(WEEK)!)).toEqual(WEEK);
  });

  it('sameJson negeert sleutelvolgorde', () => {
    expect(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson(undefined, null)).toBe(true);
  });
});
