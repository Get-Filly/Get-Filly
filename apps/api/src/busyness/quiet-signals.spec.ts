import {
  cooldownFactor,
  dateBusynessFactor,
  eventBusynessFactor,
  weatherBusynessFactor,
  COOLDOWN_WEEKS,
} from './quiet-signals';

// ============================================================
// quiet-signals — de rekenregels achter de datum-variatie
// ============================================================
// Puur, dus zonder Supabase en zonder netwerk te testen. Wat hier geborgd
// wordt is de RICHTING (drukker vs rustiger) en dat demping demping blijft:
// nooit een verkapte uitsluiting.

describe('weatherBusynessFactor', () => {
  it('geen verwachting = geen signaal', () => {
    expect(weatherBusynessFactor(null, true).factor).toBe(1);
  });

  it('regen maakt de dag rustiger dan het patroon zegt', () => {
    const { factor, reason } = weatherBusynessFactor(
      { tempMin: 9, tempMax: 14, code: 65 }, // zware regen
      false,
    );
    expect(factor).toBeLessThan(1);
    expect(reason?.reasonKey).toBe('weatherRain');
  });

  it('terrasweer maakt de dag drukker, en harder mét terras', () => {
    const warm = { tempMin: 16, tempMax: 26, code: 0 };
    const zonder = weatherBusynessFactor(warm, false).factor;
    const met = weatherBusynessFactor(warm, true).factor;
    expect(zonder).toBeGreaterThan(1);
    expect(met).toBeGreaterThan(zonder);
    // Drukker is geen reden om de dag als kans te kiezen.
    expect(weatherBusynessFactor(warm, true).reason).toBeNull();
  });

  it('hitte telt als bezoek-daler, niet als terrasweer', () => {
    // >30° is droog en warm, maar volgens de weer-regels daalt bezoek dan.
    const { factor, reason } = weatherBusynessFactor(
      { tempMin: 22, tempMax: 33, code: 0 },
      true,
    );
    expect(factor).toBeLessThan(1);
    expect(reason?.reasonKey).toBe('weatherHeat');
  });

  it('kou maakt de dag rustiger', () => {
    const { factor, reason } = weatherBusynessFactor(
      { tempMin: 1, tempMax: 5, code: 3 },
      false,
    );
    expect(factor).toBeLessThan(1);
    expect(reason?.reasonKey).toBe('weatherCold');
  });
});

describe('eventBusynessFactor', () => {
  it('geen events = geen signaal', () => {
    expect(eventBusynessFactor([]).factor).toBe(1);
  });

  it('een festival op de stoep maakt de dag fors drukker', () => {
    const { factor, reason } = eventBusynessFactor([
      {
        name: 'Zomerfeest',
        category: 'festivals',
        place: 'Deventer',
        distanceKm: 0.2,
        radiusKm: 10,
      },
    ]);
    expect(factor).toBeGreaterThan(1.4);
    expect(reason?.reasonKey).toBe('eventNearby');
    expect(reason?.reasonParams.name).toBe('Zomerfeest');
  });

  it('een markt aan de rand van de staffel weegt nauwelijks', () => {
    const { factor } = eventBusynessFactor([
      {
        name: 'Weekmarkt',
        category: 'markten',
        place: 'Zutphen',
        distanceKm: 1.8,
        radiusKm: 2,
      },
    ]);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(1.05);
  });

  it('meerdere events stapelen, maar met een plafond', () => {
    const drie = Array.from({ length: 3 }, (_, i) => ({
      name: `Festival ${i}`,
      category: 'festivals',
      place: 'Deventer',
      distanceKm: 0,
      radiusKm: 10,
    }));
    expect(eventBusynessFactor(drie).factor).toBeLessThanOrEqual(1.6);
  });

  it('noemt het zwaarste event als reden, niet het eerste', () => {
    const { reason } = eventBusynessFactor([
      {
        name: 'Rommelmarkt',
        category: 'markten',
        place: 'Zutphen',
        distanceKm: 1.5,
        radiusKm: 2,
      },
      {
        name: 'Popfestival',
        category: 'festivals',
        place: 'Zutphen',
        distanceKm: 0.5,
        radiusKm: 10,
      },
    ]);
    expect(reason?.reasonParams.name).toBe('Popfestival');
  });
});

describe('dateBusynessFactor', () => {
  it('weer en events werken tegen elkaar in en blijven binnen de bandbreedte', () => {
    const { factor } = dateBusynessFactor(
      {
        weather: { tempMin: 10, tempMax: 15, code: 82 }, // zware buien
        events: [
          {
            name: 'Popfestival',
            category: 'festivals',
            place: 'Zutphen',
            distanceKm: 0,
            radiusKm: 10,
          },
        ],
      },
      false,
    );
    // Festival duwt omhoog, regen omlaag; het resultaat blijft geclampt.
    expect(factor).toBeGreaterThanOrEqual(0.7);
    expect(factor).toBeLessThanOrEqual(1.6);
  });

  it('het sterkste signaal levert de reden', () => {
    const { reason } = dateBusynessFactor(
      {
        weather: { tempMin: 8, tempMax: 12, code: 65 },
        events: [
          {
            name: 'Weekmarkt',
            category: 'markten',
            place: 'Zutphen',
            distanceKm: 1.9,
            radiusKm: 2,
          },
        ],
      },
      false,
    );
    expect(reason?.reasonKey).toBe('weatherRain');
  });
});

describe('cooldownFactor', () => {
  it('zonder historie geen demping', () => {
    expect(cooldownFactor([])).toBe(1);
  });

  it('dempt harder naarmate het gebruik recenter is', () => {
    const nu = cooldownFactor([{ weeksAgo: 0 }]);
    const vorigeWeek = cooldownFactor([{ weeksAgo: 1 }]);
    const tweeTerug = cooldownFactor([{ weeksAgo: 2 }]);
    expect(nu).toBeLessThan(vorigeWeek);
    expect(vorigeWeek).toBeLessThan(tweeTerug);
    expect(tweeTerug).toBeLessThan(1);
  });

  it('kijkt niet verder terug dan het cool-down-venster', () => {
    expect(cooldownFactor([{ weeksAgo: COOLDOWN_WEEKS }])).toBe(1);
  });

  it('een weekdag-only treffer dempt zachter dan een volledige', () => {
    expect(cooldownFactor([{ weeksAgo: 0, weak: true }])).toBeGreaterThan(
      cooldownFactor([{ weeksAgo: 0 }]),
    );
  });

  it('blijft demping en wordt nooit uitsluiting', () => {
    const veel = Array.from({ length: 10 }, () => ({ weeksAgo: 0 }));
    expect(cooldownFactor(veel)).toBeGreaterThan(0);
    expect(cooldownFactor(veel)).toBeGreaterThanOrEqual(0.25);
  });
});
