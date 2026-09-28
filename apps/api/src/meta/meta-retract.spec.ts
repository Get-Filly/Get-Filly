import { MetaService } from './meta.service';

// ────────────────────────────────────────────────────────────
// Tests voor het terugtrekken van een gepubliceerde post.
//
// Deze flow had geen enkele test, terwijl 'ie iets onomkeerbaars doet
// (een post bij Meta weggooien) én iets waar de eigenaar op vertrouwt
// (de belofte dat de campagne écht offline is).
//
// We bouwen de service zonder Nest-container: alleen de stukken die
// retract() aanraakt worden ingevuld. Zo testen we de beslissingen —
// welke calls, en hoe een antwoord van Meta wordt uitgelegd — zonder
// het netwerk.
// ────────────────────────────────────────────────────────────

type FetchCall = { url: string; init?: { method?: string } };

function makeService(opts: {
  /** Antwoord per aangeroepen object-id. */
  responses: Record<string, { ok: boolean; body: unknown }>;
  /** Koppeling stuk: loadCredential/fetchAccounts gooit. */
  brokenCredential?: boolean;
  /** Wat Meta bij het verbinden heeft toegekend. Default: alles inclusief
   *  de delete-permissie. */
  scopes?: string[];
}) {
  const calls: FetchCall[] = [];
  const service = Object.create(MetaService.prototype) as MetaService;
  const priv = service as unknown as Record<string, unknown>;

  priv.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  priv.graphVersion = () => 'v23.0';

  priv.loadCredential = () => {
    if (opts.brokenCredential) {
      return Promise.reject(new Error('Geen Meta-koppeling voor dit restaurant'));
    }
    return Promise.resolve({
      token: 'user-token',
      meta: { page_id: 'page1' },
      scopes: opts.scopes ?? [
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_contents',
      ],
    });
  };
  priv.fetchAccounts = () =>
    Promise.resolve([{ id: 'page1', access_token: 'page-token' }]);

  priv.fetchWithTimeout = (url: string, init?: { method?: string }) => {
    calls.push({ url, init });
    // Het object-id staat tussen de versie en de query-string.
    const id = url.split('/').pop()!.split('?')[0];
    const res = opts.responses[id] ?? { ok: false, body: { error: {} } };
    return Promise.resolve({
      ok: res.ok,
      status: res.ok ? 200 : 400,
      json: () => Promise.resolve(res.body),
    });
  };

  return { service, calls };
}

describe('MetaService.retract — post van het kanaal halen', () => {
  it('verwijdert zowel de Facebook- als de Instagram-post', async () => {
    const { service, calls } = makeService({
      responses: {
        fb1: { ok: true, body: { success: true } },
        ig1: { ok: true, body: { success: true, deleted_id: 'ig1' } },
      },
    });

    const res = await service.retract('biz1', {
      facebook: 'fb1',
      instagram: 'ig1',
    });

    expect(res.facebook).toBe('deleted');
    expect(res.instagram).toBe('deleted');
    expect(res.needsReconnect).toBe(false);
    expect(res.errors).toEqual([]);

    // Allebei via DELETE, met de page-token (niet de user-token): een
    // IG-media hangt aan de gekoppelde pagina.
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.init?.method).toBe('DELETE');
      expect(c.url).toContain('access_token=page-token');
    }
    expect(calls[0].url).toContain('/fb1?');
    expect(calls[1].url).toContain('/ig1?');
  });

  it('kanaal zonder post wordt overgeslagen, niet als verwijderd gemeld', async () => {
    const { service, calls } = makeService({
      responses: { fb1: { ok: true, body: { success: true } } },
    });

    const res = await service.retract('biz1', {
      facebook: 'fb1',
      instagram: null,
    });

    expect(res.facebook).toBe('deleted');
    // 'skipped' en niet 'deleted': het scherm mag niet melden dat er een
    // Instagram-post weg is als die er nooit was.
    expect(res.instagram).toBe('skipped');
    expect(calls).toHaveLength(1);
  });

  it('doet geen enkele call als er niets gepubliceerd is', async () => {
    const { service, calls } = makeService({ responses: {} });

    const res = await service.retract('biz1', {
      facebook: null,
      instagram: null,
    });

    expect(res).toEqual({
      facebook: 'skipped',
      instagram: 'skipped',
      needsReconnect: false,
      errors: [],
    });
    expect(calls).toHaveLength(0);
  });

  it('een ontbrekende permissie vraagt om opnieuw verbinden, niet om een storingsmelding', async () => {
    // Koppelingen van vóór de instagram_manage_contents-scope krijgen
    // code 200 terug. Dat is geen storing: de eigenaar moet opnieuw
    // verbinden, en dát moet het scherm kunnen zeggen.
    const { service } = makeService({
      responses: {
        ig1: {
          ok: false,
          body: {
            error: {
              code: 200,
              message: 'Requires instagram_manage_contents permission',
            },
          },
        },
      },
    });

    const res = await service.retract('biz1', { instagram: 'ig1' });

    expect(res.instagram).toBe('failed');
    expect(res.needsReconnect).toBe(true);
    expect(res.errors[0]).toContain('Instagram-post verwijderen mislukt');
  });

  it('een gewone fout op één kanaal laat het andere kanaal ongemoeid', async () => {
    const { service } = makeService({
      responses: {
        fb1: { ok: true, body: { success: true } },
        ig1: { ok: false, body: { error: { code: 100, message: 'Onbekend id' } } },
      },
    });

    const res = await service.retract('biz1', {
      facebook: 'fb1',
      instagram: 'ig1',
    });

    expect(res.facebook).toBe('deleted');
    expect(res.instagram).toBe('failed');
    // Code 100 is geen permissieprobleem → niet opnieuw verbinden.
    expect(res.needsReconnect).toBe(false);
    expect(res.errors).toHaveLength(1);
  });

  it('een onbruikbare koppeling meldt beide kanalen als mislukt', async () => {
    // Zonder geldige koppeling is er geen page-token, dus er kan niets
    // verwijderd worden. Belangrijk dat dit NIET stil als succes langs
    // gaat: dan denkt de eigenaar dat de post offline is terwijl 'ie
    // gewoon live staat.
    const { service, calls } = makeService({
      responses: {},
      brokenCredential: true,
    });

    const res = await service.retract('biz1', {
      facebook: 'fb1',
      instagram: 'ig1',
    });

    expect(res.facebook).toBe('failed');
    expect(res.instagram).toBe('failed');
    expect(res.needsReconnect).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('MetaService.retract — koppeling zonder delete-permissie', () => {
  // Meta weigerde instagram_manage_contents op 2026-09-28 met "Invalid
  // Scopes": de permissie moet in het App Dashboard aan een use case
  // hangen. Tot dat geregeld is komt 'ie niet in de verleende scopes.
  //
  // Waar het om gaat: dan mag de app NIET zeggen "verbind opnieuw". Dat is
  // een lus — opnieuw verbinden levert precies dezelfde scopes op.
  it('probeert de IG-delete niet eens en vraagt niet om opnieuw verbinden', async () => {
    const { service, calls } = makeService({
      responses: { fb1: { ok: true, body: { success: true } } },
      scopes: ['instagram_basic', 'instagram_content_publish'],
    });

    const res = await service.retract('biz1', {
      facebook: 'fb1',
      instagram: 'ig1',
    });

    expect(res.facebook).toBe('deleted');
    expect(res.instagram).toBe('unavailable');
    // Geen zinloze lus naar de koppelingen-pagina.
    expect(res.needsReconnect).toBe(false);
    // En geen call die toch gaat falen: alleen Facebook is aangeroepen.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/fb1?');
  });

  it('verwijdert Instagram wél zodra de permissie er is', async () => {
    const { service, calls } = makeService({
      responses: { ig1: { ok: true, body: { success: true } } },
      scopes: ['instagram_basic', 'instagram_manage_contents'],
    });

    const res = await service.retract('biz1', { instagram: 'ig1' });

    expect(res.instagram).toBe('deleted');
    expect(calls).toHaveLength(1);
  });
});
