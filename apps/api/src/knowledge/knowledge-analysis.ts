import {
  KNOWLEDGE_DIMENSIONS,
  KNOWLEDGE_PARAMS as P,
  type KnowledgeConfidence,
  type KnowledgeDimension,
} from './knowledge-params';
import type { Insight, Observation } from './knowledge.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Gewicht van één meting: grotere steekproef, sterkere bron en nieuwere data tellen zwaarder. */
export function observationWeight(o: Observation, now: Date): number {
  const sample = Math.sqrt(Math.max(1, o.sampleSize ?? 1));
  const rel = P.reliabilityWeight[o.reliability ?? 2] ?? 1;
  let recency = 1;
  if (o.periodEnd) {
    const age = Math.max(0, (now.getTime() - new Date(o.periodEnd).getTime()) / DAY_MS);
    recency = Math.pow(0.5, age / P.halfLifeDays);
  }
  return sample * rel * recency;
}

export function weightedMedian(items: { value: number; weight: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  let acc = 0;
  for (const i of sorted) {
    acc += i.weight;
    if (acc >= total / 2) return i.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

function confidenceFor(n: number, sources: number): KnowledgeConfidence {
  if (n >= P.highObservations && sources >= P.highSources) return 'hoog';
  if (n >= P.midObservations) return 'midden';
  return 'laag';
}

/**
 * Berekent per kanaal welk formaat, welke hoek en welk dagdeel beter of slechter
 * scoort dan gemiddeld. Vergelijkt alleen binnen dezelfde meetwaarde en eenheid
 * (procent met procent), nooit appels met peren. Gebruikt de gewogen mediaan, zodat
 * één uitschieter of één grote bron het beeld niet bepaalt.
 */
export function analyzeObservations(
  observations: Observation[],
  now: Date = new Date(),
): Insight[] {
  const byBase = new Map<string, Observation[]>();
  for (const o of observations) {
    if (!(o.value > 0)) continue; // ratio's hebben een positieve waarde nodig
    const key = `${o.channel}|${o.metric}|${o.unit ?? ''}`;
    (byBase.get(key) ?? byBase.set(key, []).get(key)!).push(o);
  }

  const insights: Insight[] = [];
  for (const group of byBase.values()) {
    const { channel, metric } = group[0];
    const unit = group[0].unit ?? null;
    const baseline = weightedMedian(
      group.map((o) => ({ value: o.value, weight: observationWeight(o, now) })),
    );
    if (!(baseline > 0)) continue;

    for (const dim of KNOWLEDGE_DIMENSIONS) {
      const cells = new Map<string, Observation[]>();
      for (const o of group) {
        const v = o[dim];
        if (!v) continue;
        (cells.get(v) ?? cells.set(v, []).get(v)!).push(o);
      }
      for (const [dimensionValue, cell] of cells) {
        if (cell.length < P.minObservations) continue;
        const ratio = weightedMedian(
          cell.map((o) => ({ value: o.value / baseline, weight: observationWeight(o, now) })),
        );
        const lift = ratio - 1;
        if (Math.abs(lift) < P.minAbsLift) continue;
        const sources = new Set(cell.map((o) => o.sourceId)).size;
        insights.push({
          channel,
          dimension: dim as KnowledgeDimension,
          dimensionValue,
          metric,
          unit,
          lift: Math.round(lift * 100) / 100,
          nObservations: cell.length,
          nSources: sources,
          totalSample: cell.reduce((s, o) => s + (o.sampleSize ?? 0), 0),
          confidence: confidenceFor(cell.length, sources),
        });
      }
    }
  }
  return insights;
}
