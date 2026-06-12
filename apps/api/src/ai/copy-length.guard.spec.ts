import {
  findLengthViolations,
  buildLengthRetryInstruction,
} from './copy-length.guard';

describe('copy-length.guard', () => {
  describe('findLengthViolations', () => {
    it('geeft een lege lijst als alles binnen de band valt', () => {
      // WhatsApp: 300–700 tekens.
      expect(findLengthViolations('whatsapp', ['x'.repeat(500)])).toEqual([]);
    });

    it('vindt te lange + te korte bodies met de juiste index', () => {
      const v = findLengthViolations('whatsapp', [
        'x'.repeat(500), // ok
        'x'.repeat(1500), // te lang
        'kort', // te kort
      ]);
      expect(v).toHaveLength(2);
      expect(v[0]).toMatchObject({ index: 1, verdict: 'too_long' });
      expect(v[1]).toMatchObject({ index: 2, verdict: 'too_short' });
    });
  });

  describe('buildLengthRetryInstruction', () => {
    it('benoemt het gemeten aantal tekens + de overschreden grens', () => {
      const v = findLengthViolations('whatsapp', ['x'.repeat(1500)]);
      const msg = buildLengthRetryInstruction('whatsapp', v);
      expect(msg).toContain('1500 tekens');
      expect(msg).toContain('700'); // max van whatsapp
      expect(msg).toContain('variant 1');
    });
  });
});
