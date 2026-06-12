import { haversineKm } from './events.service';

describe('haversineKm', () => {
  it('is 0 voor identieke punten', () => {
    expect(haversineKm(52.37, 4.9, 52.37, 4.9)).toBeCloseTo(0, 5);
  });

  it('Amsterdam → Rotterdam ≈ 57-58 km', () => {
    // Amsterdam (52.3676, 4.9041) → Rotterdam (51.9244, 4.4777)
    const km = haversineKm(52.3676, 4.9041, 51.9244, 4.4777);
    expect(km).toBeGreaterThan(55);
    expect(km).toBeLessThan(60);
  });

  it('symmetrisch (A→B == B→A)', () => {
    const ab = haversineKm(52.37, 4.9, 51.92, 4.48);
    const ba = haversineKm(51.92, 4.48, 52.37, 4.9);
    expect(ab).toBeCloseTo(ba, 6);
  });
});
