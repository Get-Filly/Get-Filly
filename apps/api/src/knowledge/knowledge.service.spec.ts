import { KnowledgeService } from './knowledge.service';

// Kleine in-memory Supabase die precies de aanroepen van de service snapt,
// zodat de hele keten (bron, import, normaliseren, analyse, kennisblok) zonder
// database getest wordt.
type Row = Record<string, unknown>;
function fakeDb() {
  const tables: Record<string, Row[]> = {};
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] = [];
    let filters: ((r: Row) => boolean)[] = [];
    let range: [number, number] | null = null;
    let single = false;
    const run = () => {
      const match = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: `id${++n}`, ...r }));
        rows.push(...list);
        return { data: single ? list[0] : list, error: null };
      }
      if (op === 'update') {
        match.forEach((r) => Object.assign(r, payload));
        return { data: match, error: null };
      }
      if (op === 'delete') {
        for (const r of match) rows.splice(rows.indexOf(r), 1);
        return { data: null, error: null };
      }
      const out = range ? match.slice(range[0], range[1] + 1) : match;
      return { data: single ? out[0] : out, error: null };
    };
    const b: Record<string, unknown> = {
      insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), b),
      update: (p: Row) => ((op = 'update'), (payload = p), b),
      delete: () => ((op = 'delete'), b),
      select: () => b,
      single: () => ((single = true), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      not: (k: string) => (filters.push((r) => r[k] != null), b),
      range: (a: number, z: number) => ((range = [a, z]), b),
      then: (res: (v: unknown) => unknown) => res(run()),
    };
    return b;
  };
  return { client: { from }, tables };
}

describe('KnowledgeService (hele keten)', () => {
  it('van ruw bestand naar kennisblok voor Filly', async () => {
    const db = fakeDb();
    const svc = new KnowledgeService(db as never);
    const sourceId = await svc.createSource({ name: 'Testbron', reliability: 3 });
    const rows = [
      ['IG', 'Photo', 1.0], ['IG', 'Photo', 1.1], ['IG', 'Carousel', 2.4],
      ['IG', 'Carousel', 2.6], ['IG', 'Carousel', 2.5], ['IG', 'Reel', 1.6], ['IG', 'Reel', 1.5],
    ].map(([Platform, Type, Score]) => ({ Platform, Type, Score, Posts: 500 }));
    const importId = await svc.importRaw({ sourceId, rows, format: 'csv' });
    const res = await svc.normalizeImport(importId, {
      fields: { channel: 'Platform', format: 'Type', value: 'Score', sampleSize: 'Posts' },
      constants: { metric: 'interactie', unit: 'procent' },
    });
    expect(res).toMatchObject({ inserted: 7, skipped: 0 });

    // opnieuw normaliseren vervangt, dupliceert niet
    await svc.normalizeImport(importId, {
      fields: { channel: 'Platform', format: 'Type', value: 'Score', sampleSize: 'Posts' },
      constants: { metric: 'interactie', unit: 'procent' },
    });
    expect(db.tables.kb_observations).toHaveLength(7);

    const run = await svc.runAnalysis();
    expect(run.observations).toBe(7);
    expect(run.insights).toBeGreaterThan(0);

    const brief = await svc.getBrief(['instagram']);
    expect(brief).toContain('carrousel');
    expect(brief).toContain('boven gemiddeld');
    expect(await svc.getBrief(['tiktok'])).toBe('');
  });

  it('geeft een lege string en geen fout als de kennisbank stukgaat', async () => {
    const broken = {
      client: { from: () => { throw new Error('db weg'); } },
    };
    const svc = new KnowledgeService(broken as never);
    await expect(svc.getBrief(['instagram'])).resolves.toBe('');
  });
});
