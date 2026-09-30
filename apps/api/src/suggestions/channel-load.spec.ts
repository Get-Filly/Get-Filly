import { SuggestionsService } from './suggestions.service';

// De zachte waarschuwing per kanaal: telt de uitingen in de week en zet ze
// tegenover het maximum uit de kanaalregels.
function makeService(count: number, error: unknown = null) {
  const calls: Record<string, unknown[]> = {};
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lt']) {
    b[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return b;
    };
  }
  b.then = (res: (v: unknown) => unknown) => res({ count, error });
  const supabase = { client: { from: () => b } };
  const rest = new Array(20).fill({}) as never[];
  const svc = new (SuggestionsService as unknown as new (
    ...a: never[]
  ) => SuggestionsService)(supabase as never, ...rest);
  return { svc, calls };
}

describe('getChannelLoad', () => {
  it('zegt dat het maximum bereikt is als er al genoeg staan', async () => {
    const { svc, calls } = makeService(4);
    // Facebook: maximaal 4 per week
    const res = await svc.getChannelLoad(
      'b',
      'facebook',
      '2026-10-08T10:00:00Z',
    );
    expect(res).toMatchObject({
      channel: 'facebook',
      count: 4,
      max: 4,
      exceeded: true,
      weekStart: '2026-10-05',
    });
    expect(JSON.stringify(calls.eq)).toContain('facebook');
  });

  it('zegt dat er nog ruimte is onder het maximum', async () => {
    const { svc } = makeService(2);
    const res = await svc.getChannelLoad(
      'b',
      'instagram',
      '2026-10-08T10:00:00Z',
    );
    expect(res).toMatchObject({ count: 2, max: 5, exceeded: false });
  });

  it('weigert een onbekend kanaal en een ongeldig moment', async () => {
    const { svc } = makeService(0);
    await expect(
      svc.getChannelLoad('b', 'youtube', '2026-10-08T10:00:00Z'),
    ).rejects.toThrow();
    await expect(
      svc.getChannelLoad('b', 'facebook', 'geen-datum'),
    ).rejects.toThrow();
  });
});
