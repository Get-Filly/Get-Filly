import {
  suffixCandidates,
  stripPlaceSuffix,
  prettify,
  normalizePlace,
  isExactPlaceMatch,
  isContainedPlaceMatch,
} from './events-sync.service';

describe('events-sync slug-helpers', () => {
  describe('suffixCandidates', () => {
    it('geeft 1→3 token-suffixen vóór de datum, kortste eerst', () => {
      expect(suffixCandidates('dickens-festijn-deventer-2026-12-19')).toEqual([
        'deventer',
        'festijn-deventer',
        'dickens-festijn-deventer',
      ]);
    });
    it('werkt met meerwoordige plaatsen', () => {
      expect(suffixCandidates('jazz-festival-den-bosch-2026-07-01')).toEqual([
        'bosch',
        'den-bosch',
        'festival-den-bosch',
      ]);
    });
  });

  describe('stripPlaceSuffix + prettify', () => {
    it('strip de plaats van de naam', () => {
      expect(stripPlaceSuffix('1-ander-festival-schijndel', 'schijndel')).toBe(
        '1-ander-festival',
      );
    });
    it('prettify maakt leesbare naam met hoofdletter', () => {
      expect(prettify('1-ander-festival')).toBe('1 ander festival');
    });
  });

  describe('normalizePlace', () => {
    it('lowercased, zonder diacritics en leestekens', () => {
      expect(normalizePlace("'s-Hertogenbosch")).toBe('shertogenbosch');
      expect(normalizePlace('Châteauneuf')).toBe('chateauneuf');
    });
  });

  describe('isExactPlaceMatch', () => {
    it('exacte naam-match (genormaliseerd)', () => {
      expect(isExactPlaceMatch('schijndel', 'Schijndel')).toBe(true);
    });
    it('fuzzy PDOK-match wordt afgewezen (zee ≠ Zeeland)', () => {
      expect(isExactPlaceMatch('zee', 'Zeeland')).toBe(false);
    });
    it('alias den-bosch → s-Hertogenbosch', () => {
      expect(isExactPlaceMatch('den-bosch', "'s-Hertogenbosch")).toBe(true);
    });
    it('null matched_name → false', () => {
      expect(isExactPlaceMatch('schijndel', null)).toBe(false);
    });
  });

  describe('isContainedPlaceMatch (fuzzy-fallback)', () => {
    it('wederzijdse bevatting telt (terschelling ⊆ West-Terschelling)', () => {
      expect(isContainedPlaceMatch('terschelling', 'West-Terschelling')).toBe(
        true,
      );
    });
    it('junk-token wordt afgewezen', () => {
      expect(
        isContainedPlaceMatch('oerol-2026-terschelling', 'West-Terschelling'),
      ).toBe(false);
    });
    it('micro-token (<4 tekens) telt niet', () => {
      expect(isContainedPlaceMatch('zee', 'Zeeland')).toBe(false);
    });
  });
});
