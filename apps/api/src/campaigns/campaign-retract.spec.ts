import { CampaignsService } from './campaigns.service';
import type { MetaRetractResult } from '../meta/meta.service';

// ────────────────────────────────────────────────────────────
// retractFromChannel — wat er ná het verwijderen in onze eigen
// database belandt.
//
// Het subtiele punt zit in ig_pending_manual_delete_url: dat veld is
// een herinnering voor de eigenaar ("deze post staat nog live, haal 'm
// zelf weg"). Zolang Instagram niet verwijderd kón worden was die
// herinnering altijd terecht. Nu Instagram wél verwijderd wordt, mag
// 'ie alléén nog verschijnen als het verwijderen echt mislukt is —
// anders stuurt de app mensen naar een post die er niet meer is.
// ────────────────────────────────────────────────────────────

type Captured = { table: string; payload: Record<string, unknown> };

function makeService(opts: {
  postIds: Record<string, unknown> | null;
  metaResult?: MetaRetractResult;
  metaThrows?: boolean;
}) {
  const updates: Captured[] = [];
  const metaCalls: unknown[] = [];

  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order', 'in']) b[m] = () => b;
      b.update = (payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return b;
      };
      b.maybeSingle = () =>
        Promise.resolve({
          data:
            table === 'campaign_social_content'
              ? { published_post_ids: opts.postIds }
              : null,
          error: null,
        });
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return b;
    },
  };

  const service = Object.create(CampaignsService.prototype) as CampaignsService;
  const priv = service as unknown as Record<string, unknown>;
  priv.supabase = { client };
  priv.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  priv.meta = {
    retract: (businessId: string, ids: unknown) => {
      metaCalls.push(ids);
      if (opts.metaThrows) return Promise.reject(new Error('netwerk stuk'));
      return Promise.resolve(opts.metaResult);
    },
  };

  const run = (type: string | null = 'social') =>
    (
      priv.retractFromChannel as (
        b: string,
        c: string,
        t: string | null,
      ) => Promise<unknown>
    ).call(service, 'biz1', 'camp1', type);

  return { run, updates, metaCalls };
}

const ok: MetaRetractResult = {
  facebook: 'deleted',
  instagram: 'deleted',
  needsReconnect: false,
  errors: [],
};

describe('retractFromChannel — staat opruimen na het terugtrekken', () => {
  it('wist de publicatiestaat en laat géén herinnering achter als alles verwijderd is', async () => {
    const { run, updates } = makeService({
      postIds: { facebook: 'fb1', instagram: 'ig1', instagram_permalink: 'https://insta/p/1' },
      metaResult: ok,
    });

    const report = await run();

    const upd = updates.find((u) => u.table === 'campaign_social_content')!;
    expect(upd.payload.published_at).toBeNull();
    expect(upd.payload.published_post_ids).toBeNull();
    // De kern: er staat niets meer live, dus ook geen "haal 'm zelf weg".
    expect(upd.payload.ig_pending_manual_delete_url).toBeNull();
    expect(report).toMatchObject({ instagram: 'deleted', facebook: 'deleted' });
  });

  it('bewaart de directe link als Instagram niet verwijderd kon worden', async () => {
    const { run, updates } = makeService({
      postIds: { instagram: 'ig1', instagram_permalink: 'https://insta/p/1' },
      metaResult: { ...ok, facebook: 'skipped', instagram: 'failed' },
    });

    await run();

    const upd = updates.find((u) => u.table === 'campaign_social_content')!;
    expect(upd.payload.ig_pending_manual_delete_url).toBe('https://insta/p/1');
  });

  it('valt terug op de sentinel als de permalink onbekend is', async () => {
    // Oudere posts zijn gepubliceerd voordat we de permalink bewaarden.
    // De melding moet er dan alsnog komen, met een generieke link.
    const { run, updates } = makeService({
      postIds: { instagram: 'ig1' },
      metaResult: { ...ok, facebook: 'skipped', instagram: 'failed' },
    });

    await run();

    const upd = updates.find((u) => u.table === 'campaign_social_content')!;
    expect(upd.payload.ig_pending_manual_delete_url).toBe('manual');
  });

  it('roept Meta niet aan als er niets gepubliceerd is', async () => {
    const { run, metaCalls, updates } = makeService({ postIds: null });

    const report = await run();

    expect(metaCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(report).toBeNull();
  });

  it('raakt Meta niet aan voor een kanaal zonder koppeling (whatsapp)', async () => {
    const { run, metaCalls } = makeService({ postIds: { facebook: 'fb1' } });

    const report = await run('whatsapp');

    expect(metaCalls).toHaveLength(0);
    expect(report).toBeNull();
  });

  it('blijft overeind als de Meta-call zelf omvalt', async () => {
    // Fail-soft: anders blijft de campagne op 'actief' hangen en kan de
    // eigenaar 'm helemaal niet meer stoppen.
    const { run, updates } = makeService({
      postIds: { facebook: 'fb1' },
      metaThrows: true,
    });

    const report = await run();

    expect(report).toBeNull();
    // De publicatiestaat wordt wél gewist: de campagne gaat terug naar
    // concept en moet opnieuw gepubliceerd kunnen worden.
    expect(
      updates.find((u) => u.table === 'campaign_social_content'),
    ).toBeDefined();
  });
});
