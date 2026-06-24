import { CampaignsService } from './campaigns.service';

// ────────────────────────────────────────────────────────────
// Kleine chainable Supabase-mock. Per tabel een wachtrij met
// resultaten {data,error}; elke terminal (maybeSingle/single of een
// direct ge-await'te builder) consumeert het volgende item uit die
// rij. Volgorde binnen één tabel telt, cross-tabel niet.
// ────────────────────────────────────────────────────────────
type QueryResult = { data?: unknown; error?: unknown };

function makeClient(queues: Record<string, QueryResult[]>) {
  const build = (table: string) => {
    const take = (): QueryResult =>
      queues[table]?.shift() ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of [
      'select',
      'insert',
      'update',
      'delete',
      'eq',
      'is',
      'order',
      'in',
    ]) {
      b[m] = chain;
    }
    b.maybeSingle = () => Promise.resolve(take());
    b.single = () => Promise.resolve(take());
    // Maakt de builder awaitable (voor query's zonder maybeSingle/single).
    b.then = (resolve: (v: QueryResult) => unknown, reject?: unknown) =>
      Promise.resolve(take()).then(resolve, reject as never);
    return b;
  };
  return { from: (table: string) => build(table) };
}

function makeService(queues: Record<string, QueryResult[]>): CampaignsService {
  const service = Object.create(
    CampaignsService.prototype,
  ) as CampaignsService;
  (service as unknown as { supabase: unknown }).supabase = {
    client: makeClient(queues),
  };
  return service;
}

describe('CampaignsService — kanalen toevoegen/verwijderen', () => {
  it('addChannel promoot een los concept tot bundel en maakt het juiste social-concept', async () => {
    const service = makeService({
      campaign_groups: [
        { data: null }, // resolve: id is geen group
        { data: { id: 'grp1', name: 'Zomer' } }, // promote-insert
      ],
      campaigns: [
        {
          data: {
            id: 'camp1',
            name: 'Zomer',
            group_id: null,
            status: 'concept',
          },
        }, // resolve als campaign
        { error: null }, // update group_id
        { data: [{ id: 'camp1', type: 'mail' }] }, // bestaande kanalen
      ],
    });
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ id: 'newIg' });

    const res = await service.addChannel('rest1', 'camp1', 'instagram', 'u1');

    expect(res).toEqual({ id: 'grp1' });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const input = createSpy.mock.calls[0][1] as {
      type: string;
      social_platforms?: string[];
      group_id?: string;
    };
    expect(input.type).toBe('social');
    expect(input.social_platforms).toEqual(['instagram']);
    expect(input.group_id).toBe('grp1');
  });

  it('addChannel is idempotent: kanaal dat al in de bundel zit maakt niets aan', async () => {
    const service = makeService({
      campaign_groups: [{ data: { id: 'grp1', name: 'Zomer' } }], // id is een group
      campaigns: [{ data: [{ id: 'ci', type: 'social' }] }],
      campaign_social_content: [{ data: { platforms: ['instagram'] } }],
    });
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ id: 'x' });

    const res = await service.addChannel('rest1', 'grp1', 'instagram', 'u1');

    expect(res).toEqual({ id: 'grp1' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('removeChannel weigert het laatste kanaal te verwijderen', async () => {
    const service = makeService({
      campaign_groups: [{ data: { id: 'grp1', name: 'Zomer' } }],
      campaigns: [{ data: [{ id: 'c1', type: 'mail' }] }], // één kanaal
    });
    const removeSpy = jest
      .spyOn(service, 'remove')
      .mockResolvedValue({ id: 'c1' });

    await expect(
      service.removeChannel('rest1', 'grp1', 'mail', 'u1'),
    ).rejects.toThrow(/minstens één kanaal/i);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('removeChannel soft-delete de sub-campagne van het juiste kanaal', async () => {
    const service = makeService({
      campaign_groups: [{ data: { id: 'grp1', name: 'Zomer' } }],
      campaigns: [
        {
          data: [
            { id: 'cm', type: 'mail' },
            { id: 'ci', type: 'social' },
          ],
        },
      ],
      campaign_social_content: [{ data: { platforms: ['instagram'] } }],
    });
    const removeSpy = jest
      .spyOn(service, 'remove')
      .mockResolvedValue({ id: 'ci' });

    const res = await service.removeChannel('rest1', 'grp1', 'instagram', 'u1');

    expect(removeSpy).toHaveBeenCalledWith('rest1', 'ci', 'u1');
    expect(res).toEqual({ id: 'grp1' });
  });

  it('kanalen wijzigen kan alleen op een concept', async () => {
    const service = makeService({
      campaign_groups: [{ data: null }],
      campaigns: [
        {
          data: {
            id: 'c',
            name: 'X',
            group_id: null,
            status: 'ingepland',
          },
        },
      ],
    });
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ id: 'x' });

    await expect(
      service.addChannel('rest1', 'c', 'instagram', 'u1'),
    ).rejects.toThrow(/concept/i);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
