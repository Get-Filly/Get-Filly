import {
  getNlHolidays,
  buildExternalFactorsBlock,
  salaryContext,
  seasonContext,
} from './timing-factors';

// Pure, deterministische datum-logica — het type code dat met de hand
// werd geverifieerd. Hier vastgelegd zodat een verkeerde Pasen-afgeleide
// of dag-grens meteen rood wordt.
describe('timing-factors', () => {
  describe('getNlHolidays — beweegbare feestdagen 2026', () => {
    const byName = (year: number) =>
      Object.fromEntries(getNlHolidays(year).map((h) => [h.name, h.date]));

    it('leidt de Pasen-gebaseerde dagen correct af (Pasen 2026 = 5 apr)', () => {
      const h = byName(2026);
      expect(h['1e Paasdag']).toBe('2026-04-05');
      expect(h['2e Paasdag']).toBe('2026-04-06');
      expect(h['Goede Vrijdag']).toBe('2026-04-03');
      expect(h['Hemelvaartsdag']).toBe('2026-05-14'); // Pasen + 39
      expect(h['1e Pinksterdag']).toBe('2026-05-24'); // Pasen + 49
      expect(h['2e Pinksterdag']).toBe('2026-05-25');
    });

    it('berekent Moederdag (2e zo mei) en Vaderdag (3e zo jun) 2026', () => {
      const h = byName(2026);
      expect(h['Moederdag']).toBe('2026-05-10');
      expect(h['Vaderdag']).toBe('2026-06-21');
    });

    it('markeert negatieve feestdagen als avoid (Goede Vrijdag, 1e Paasdag)', () => {
      const all = getNlHolidays(2026);
      const gv = all.find((h) => h.name === 'Goede Vrijdag');
      const paas2 = all.find((h) => h.name === '2e Paasdag');
      expect(gv?.avoid).toBe(true);
      expect(paas2?.avoid).toBeFalsy();
    });

    it('Koningsdag is nooit op zondag (verschuift dan naar 26 apr)', () => {
      // Zoek een jaar waarin 27 apr een zondag is en check de regel.
      let sundayYear: number | null = null;
      for (let y = 2024; y < 2040; y++) {
        if (new Date(Date.UTC(y, 3, 27)).getUTCDay() === 0) {
          sundayYear = y;
          break;
        }
      }
      expect(sundayYear).not.toBeNull();
      const h = byName(sundayYear as number);
      expect(h['Koningsdag']).toBe(`${sundayYear}-04-26`);
      // En generiek: nooit een zondag, welk jaar dan ook.
      for (let y = 2026; y < 2032; y++) {
        const kd = byName(y)['Koningsdag'];
        expect(new Date(`${kd}T12:00:00Z`).getUTCDay()).not.toBe(0);
      }
    });
  });

  describe('buildExternalFactorsBlock — includeHolidays-schakelaar', () => {
    const today = new Date('2026-06-12T10:00:00Z');

    it('toont feestdagen wanneer includeHolidays = true', () => {
      const block = buildExternalFactorsBlock(today, 21, {
        includeHolidays: true,
      });
      expect(block).toContain('Feestdagen in beeld');
    });

    it('laat de feestdagen-sectie weg bij includeHolidays = false', () => {
      const block = buildExternalFactorsBlock(today, 21, {
        includeHolidays: false,
      });
      expect(block).not.toContain('Feestdagen in beeld');
    });

    it('behoudt loondag/seizoen/weer ongeacht de schakelaar', () => {
      const block = buildExternalFactorsBlock(today, 21, {
        includeHolidays: false,
      });
      expect(block).toContain('Bestedings-context');
      expect(block).toContain('Seizoen');
      expect(block).toContain('WEER-REGELS');
    });
  });

  describe('salary- en seasonContext', () => {
    it('herkent het loondag-cluster rond de 25e', () => {
      expect(salaryContext(new Date('2026-03-26T12:00:00Z'))).toContain(
        'Loondag-cluster',
      );
    });
    it('herkent begin van de maand', () => {
      expect(salaryContext(new Date('2026-03-03T12:00:00Z'))).toContain(
        'Begin van de maand',
      );
    });
    it('seizoen: juni = zomer', () => {
      expect(seasonContext(new Date('2026-06-12T12:00:00Z'))).toContain(
        'Zomer',
      );
    });
  });
});
