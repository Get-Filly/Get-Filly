import type { Logger } from '@nestjs/common';
import {
  findLengthViolations,
  buildLengthRetryInstruction,
  enforceCopyLength,
} from './copy-length.guard';

// Minimale Logger-stub; enforceCopyLength gebruikt alleen .warn.
const noopLogger = { warn: () => {}, error: () => {} } as unknown as Logger;
type Bodies = { bodies: string[] };

describe('copy-length.guard', () => {
  describe('findLengthViolations', () => {
    it('geeft een lege lijst als alles binnen de band valt', () => {
      // Facebook: 250–500 tekens.
      expect(findLengthViolations('facebook', ['x'.repeat(400)])).toEqual([]);
    });

    it('vindt te lange + te korte bodies met de juiste index', () => {
      const v = findLengthViolations('facebook', [
        'x'.repeat(400), // ok
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
      const v = findLengthViolations('facebook', ['x'.repeat(1500)]);
      const msg = buildLengthRetryInstruction('facebook', v);
      expect(msg).toContain('1500 tekens');
      expect(msg).toContain('500'); // max van facebook
      expect(msg).toContain('variant 1');
    });
  });

  describe('enforceCopyLength', () => {
    const getBodies = (r: Bodies) => r.bodies;

    it('houdt het eerste resultaat als de herschrijf inhoud kwijtraakt (regressie)', async () => {
      // Eerste poging: te lang (1 overtreding) maar WEL bruikbaar.
      const first: Bodies = { bodies: ['x'.repeat(1500)] };
      // Herschrijf komt leeg terug: 0 lengte-overtredingen, maar ook 0
      // bruikbare teksten. Mag het eerste resultaat NOOIT vervangen.
      const second: Bodies = { bodies: [''] };
      const out = await enforceCopyLength<Bodies>({
        channel: 'facebook',
        first,
        getBodies,
        regenerate: async () => second,
        logger: noopLogger,
        feature: 'test',
      });
      expect(out).toBe(first);
    });

    it('houdt het eerste resultaat als de herschrijf minder varianten teruggeeft', async () => {
      const first: Bodies = { bodies: ['x'.repeat(1500), 'x'.repeat(1500)] };
      const second: Bodies = { bodies: ['x'.repeat(400)] }; // binnen band, maar 1 i.p.v. 2
      const out = await enforceCopyLength<Bodies>({
        channel: 'facebook',
        first,
        getBodies,
        regenerate: async () => second,
        logger: noopLogger,
        feature: 'test',
      });
      expect(out).toBe(first);
    });

    it('gebruikt de herschrijf als die de lengte fixt zónder inhoud te verliezen', async () => {
      const first: Bodies = { bodies: ['x'.repeat(1500)] }; // te lang
      const second: Bodies = { bodies: ['x'.repeat(400)] }; // binnen band
      const out = await enforceCopyLength<Bodies>({
        channel: 'facebook',
        first,
        getBodies,
        regenerate: async () => second,
        logger: noopLogger,
        feature: 'test',
      });
      expect(out).toBe(second);
    });

    it('accepteert het eerste resultaat direct als alles binnen de band valt', async () => {
      const first: Bodies = { bodies: ['x'.repeat(400)] };
      let regenerated = false;
      const out = await enforceCopyLength<Bodies>({
        channel: 'facebook',
        first,
        getBodies,
        regenerate: async () => {
          regenerated = true;
          return { bodies: ['x'.repeat(400)] };
        },
        logger: noopLogger,
        feature: 'test',
      });
      expect(out).toBe(first);
      expect(regenerated).toBe(false);
    });
  });
});
