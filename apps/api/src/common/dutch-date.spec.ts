import { resolveDutchDate } from './dutch-date';

// Vaste referentie: vrijdag 12 juni 2026 (deterministisch, los van
// wanneer de test draait).
const FRIDAY = new Date('2026-06-12T10:00:00Z');
const r = (phrase: string) => resolveDutchDate(phrase, FRIDAY);

describe('resolveDutchDate', () => {
  it('vaste relatieve woorden', () => {
    expect(r('vandaag')).toBe('2026-06-12');
    expect(r('morgen')).toBe('2026-06-13');
    expect(r('overmorgen')).toBe('2026-06-14');
  });

  it('overmorgen wint van morgen (substring-valkuil)', () => {
    expect(r('overmorgen')).toBe('2026-06-14');
  });

  it('relatief "over N dagen/weken"', () => {
    expect(r('over 5 dagen')).toBe('2026-06-17'); // 12 + 5
    expect(r('maak een voorstel voor over 5 dagen')).toBe('2026-06-17');
    expect(r('over een dag')).toBe('2026-06-13');
    expect(r('over een week')).toBe('2026-06-19'); // 12 + 7
    expect(r('over 2 weken')).toBe('2026-06-26'); // 12 + 14
  });

  it('kale weekdag = eerstvolgende voorkomen', () => {
    expect(r('zondag')).toBe('2026-06-14'); // vr → +2
    expect(r('zaterdag')).toBe('2026-06-13'); // vr → +1
    expect(r('vrijdag')).toBe('2026-06-12'); // vandaag is vrijdag
  });

  it('volgende week <weekdag> = de week erna', () => {
    expect(r('volgende week zondag')).toBe('2026-06-21');
    expect(r('volgende week maandag')).toBe('2026-06-15');
  });

  it('rommelige zin rond een weekdag werkt ook', () => {
    expect(r('doe iets leuks voor aankomende zondag joh')).toBe('2026-06-14');
  });

  it('weekend → eerstvolgende zaterdag', () => {
    expect(r('komend weekend')).toBe('2026-06-13');
    expect(r('dit weekend')).toBe('2026-06-13');
  });

  it('DD maand (dit jaar, nog niet voorbij)', () => {
    expect(r('20 juni')).toBe('2026-06-20');
    expect(r('3 mei 2027')).toBe('2027-05-03');
  });

  it('DD maand al voorbij → volgend jaar', () => {
    expect(r('1 januari')).toBe('2027-01-01');
  });

  it('feestdagen → eerstvolgende voorkomen', () => {
    expect(r('vaderdag')).toBe('2026-06-21');
    expect(r('kerst')).toBe('2026-12-25');
    expect(r('tweede kerstdag')).toBe('2026-12-26');
    // Moederdag 2026 (10 mei) is al voorbij → 2027.
    expect(r('moederdag')?.startsWith('2027-05')).toBe(true);
  });

  it('ongeldige/onbekende frase → null', () => {
    expect(r('')).toBeNull();
    expect(r('blabla onzin')).toBeNull();
    expect(r('31 februari')).toBeNull();
  });
});
