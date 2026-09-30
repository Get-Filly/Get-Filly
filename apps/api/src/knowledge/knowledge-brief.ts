import { KNOWLEDGE_PARAMS as P, type KnowledgeConfidence } from './knowledge-params';
import type { Insight } from './knowledge.types';

const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  google_business: 'Google Bedrijfsprofiel',
};
const DIM_LABEL = { format: 'formaat', topic: 'hoek', daypart: 'dagdeel' } as const;
const RANK: Record<KnowledgeConfidence, number> = { laag: 0, midden: 1, hoog: 2 };

function pct(lift: number): string {
  return `${Math.abs(Math.round(lift * 100))}%`;
}

/**
 * Maakt het kennisblok voor Filly's prompt. Bevat alleen uitkomsten in woorden,
 * geen bronnen, geen namen van bedrijven en geen ruwe cijfers per post.
 * Leeg resultaat (lege string) als er niets is: dan verandert er niets aan de prompt.
 */
export function formatKnowledgeBrief(insights: Insight[], channels: string[]): string {
  const minRank = RANK[P.briefMinConfidence];
  const lines: string[] = [];
  for (const channel of channels) {
    const own = insights
      .filter((i) => i.channel === channel && RANK[i.confidence] >= minRank)
      .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));
    const good = own.filter((i) => i.lift > 0).slice(0, P.briefTopPositive);
    const bad = own.filter((i) => i.lift < 0).slice(0, P.briefTopNegative);
    if (good.length + bad.length === 0) continue;
    const label = CHANNEL_LABEL[channel] ?? channel;
    for (const i of good) {
      lines.push(
        `- ${label}, ${DIM_LABEL[i.dimension]} "${i.dimensionValue}" scoort ${pct(i.lift)} boven gemiddeld op ${i.metric} (vertrouwen ${i.confidence}).`,
      );
    }
    for (const i of bad) {
      lines.push(
        `- ${label}, ${DIM_LABEL[i.dimension]} "${i.dimensionValue}" scoort ${pct(i.lift)} onder gemiddeld op ${i.metric} (vertrouwen ${i.confidence}).`,
      );
    }
  }
  if (lines.length === 0) return '';
  return `WAT WERKT NU (interne kennis uit onze analyse, gebruik dit om formaat en hoek te kiezen, noem de cijfers of de herkomst niet tegen de eigenaar en volg het niet blind als het niet past bij dit restaurant):\n${lines.join('\n')}`;
}
