import { analyzeObservations, weightedMedian } from './knowledge-analysis';
import { formatKnowledgeBrief } from './knowledge-brief';
import { normalizeRows, parseNumber } from './knowledge-normalize';
import { KNOWLEDGE_PARAMS } from './knowledge-params';
import type { Observation } from './knowledge.types';

const NOW = new Date('2026-10-01T00:00:00Z');
const obs = (o: Partial<Observation>): Observation => ({
  sourceId: 's1',
  channel: 'instagram',
  metric: 'interactie',
  unit: 'procent',
  value: 2,
  sampleSize: 100,
  periodEnd: '2026-09-01',
  reliability: 2,
  ...o,
});

describe('knowledge params (vastgepind)', () => {
  it('houdt de drempels bewust', () => {
    expect(KNOWLEDGE_PARAMS).toMatchObject({
      minObservations: 2,
      midObservations: 3,
      highObservations: 5,
      highSources: 2,
      minAbsLift: 0.1,
      halfLifeDays: 365,
      briefTopPositive: 3,
      briefTopNegative: 2,
    });
  });
});

describe('normalizeRows', () => {
  it('mapt kolommen, synoniemen en Nederlandse getallen', () => {
    const r = normalizeRows(
      [
        { Platform: 'IG', Type: 'Carousel', Score: '2,7', Posts: '1.200', Tot: '2026-08-31' },
        { Platform: 'Snapchat', Type: 'Reel', Score: '1,0', Posts: '10', Tot: '2026-08-31' },
        { Platform: 'FB', Type: 'Photo', Score: 'n.v.t.', Posts: '10', Tot: '2026-08-31' },
      ],
      {
        fields: {
          channel: 'Platform',
          format: 'Type',
          value: 'Score',
          sampleSize: 'Posts',
          periodEnd: 'Tot',
        },
        constants: { metric: 'Interactie', unit: 'procent' },
        numberLocale: 'nl',
      },
    );
    expect(r.observations).toEqual([
      expect.objectContaining({
        channel: 'instagram',
        format: 'carrousel',
        value: 2.7,
        sampleSize: 1200,
        metric: 'interactie',
        periodEnd: '2026-08-31',
      }),
    ]);
    expect(r.skipped).toBe(2);
    expect(r.reasons).toEqual({ 'kanaal onbekend': 1, 'waarde ontbreekt': 1 });
  });

  it('parseert getallen per taalinstelling', () => {
    expect(parseNumber('1.234,5', 'nl')).toBe(1234.5);
    expect(parseNumber('1,234.5', 'en')).toBe(1234.5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('analyzeObservations', () => {
  const base = [
    obs({ format: 'foto', value: 1.0, sourceId: 'a' }),
    obs({ format: 'foto', value: 1.0, sourceId: 'b' }),
    obs({ format: 'carrousel', value: 2.0, sourceId: 'a' }),
    obs({ format: 'carrousel', value: 2.2, sourceId: 'b' }),
    obs({ format: 'carrousel', value: 1.8, sourceId: 'a' }),
    obs({ format: 'reel', value: 1.5, sourceId: 'a' }),
    obs({ format: 'reel', value: 1.5, sourceId: 'b' }),
  ];

  it('vindt dat een carrousel boven het kanaalgemiddelde scoort', () => {
    const res = analyzeObservations(base, NOW);
    const carrousel = res.find((i) => i.dimensionValue === 'carrousel');
    expect(carrousel).toBeDefined();
    expect(carrousel!.lift).toBeGreaterThan(0.2);
    expect(carrousel!.nSources).toBe(2);
    expect(carrousel!.confidence).toBe('midden'); // 3 metingen
    const foto = res.find((i) => i.dimensionValue === 'foto');
    expect(foto!.lift).toBeLessThan(0);
  });

  it('zegt niets bij te weinig metingen of te klein verschil', () => {
    const res = analyzeObservations(
      [obs({ format: 'story', value: 5 }), obs({ format: 'foto', value: 1 }), obs({ format: 'foto', value: 1.02 })],
      NOW,
    );
    expect(res.find((i) => i.dimensionValue === 'story')).toBeUndefined();
  });

  it('vergelijkt nooit verschillende meetwaarden of kanalen met elkaar', () => {
    const res = analyzeObservations(
      [
        ...base,
        obs({ channel: 'facebook', format: 'carrousel', value: 50, metric: 'bereik', unit: 'aantal' }),
        obs({ channel: 'facebook', format: 'carrousel', value: 60, metric: 'bereik', unit: 'aantal' }),
      ],
      NOW,
    );
    expect(res.filter((i) => i.channel === 'facebook')).toEqual([]);
  });

  it('geeft oude data minder gewicht', () => {
    const recent = analyzeObservations(
      [
        obs({ format: 'foto', value: 1 }),
        obs({ format: 'foto', value: 1 }),
        obs({ format: 'reel', value: 2 }),
        obs({ format: 'reel', value: 2 }),
        obs({ format: 'reel', value: 0.5, periodEnd: '2020-01-01', sampleSize: 100 }),
      ],
      NOW,
    );
    expect(recent.find((i) => i.dimensionValue === 'reel')!.lift).toBeGreaterThan(0.2);
  });

  it('weightedMedian kiest de zwaarste helft', () => {
    expect(weightedMedian([{ value: 1, weight: 1 }, { value: 10, weight: 5 }])).toBe(10);
  });
});

describe('formatKnowledgeBrief', () => {
  const insights = analyzeObservationsForBrief();
  function analyzeObservationsForBrief() {
    return [
      { channel: 'instagram', dimension: 'format' as const, dimensionValue: 'carrousel', metric: 'interactie', unit: 'procent', lift: 0.35, nObservations: 6, nSources: 3, totalSample: 900, confidence: 'hoog' as const },
      { channel: 'instagram', dimension: 'format' as const, dimensionValue: 'foto', metric: 'interactie', unit: 'procent', lift: -0.2, nObservations: 4, nSources: 2, totalSample: 300, confidence: 'midden' as const },
      { channel: 'instagram', dimension: 'topic' as const, dimensionValue: 'sfeer', metric: 'interactie', unit: 'procent', lift: 0.5, nObservations: 2, nSources: 1, totalSample: 20, confidence: 'laag' as const },
    ];
  }

  it('geeft alleen inzichten met genoeg vertrouwen, zonder bronnen of aantallen', () => {
    const text = formatKnowledgeBrief(insights, ['instagram']);
    expect(text).toContain('carrousel');
    expect(text).toContain('35% boven gemiddeld');
    expect(text).toContain('20% onder gemiddeld');
    expect(text).not.toContain('sfeer'); // te weinig vertrouwen
    expect(text).not.toMatch(/900|bron/i);
  });

  it('geeft een lege string zonder inzichten of voor andere kanalen', () => {
    expect(formatKnowledgeBrief([], ['instagram'])).toBe('');
    expect(formatKnowledgeBrief(insights, ['tiktok'])).toBe('');
  });
});
