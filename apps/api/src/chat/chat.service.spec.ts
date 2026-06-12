import {
  extractGuidedStart,
  mergeActiveAction,
  sanitizeActionInput,
  formatActiveActionBlock,
  detectCampaignHint,
} from './chat.service';

// Een geldige nabije datum dynamisch (altijd binnen [now-1d, now+120d]).
const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

describe('extractGuidedStart', () => {
  it('geen blok → card null, tekst ongemoeid', () => {
    const r = extractGuidedStart('Wil je een mail of een post?');
    expect(r.card).toBeNull();
    expect(r.cleanText).toBe('Wil je een mail of een post?');
  });

  it('geldige datum + topic → card gevuld, proza behouden, blok gestript', () => {
    const r = extractGuidedStart(
      `Ik zet 'm klaar.\n<<FILLY_START_GUIDED>>{"date":"${soon}","topic":"Burrata"}<<END>>`,
    );
    expect(r.card).toEqual({
      kind: 'guided_start',
      date: soon,
      topic: 'Burrata',
    });
    expect(r.cleanText).toBe("Ik zet 'm klaar.");
  });

  it('leeg blok → card zonder datum/topic', () => {
    const r = extractGuidedStart('<<FILLY_START_GUIDED>>{}<<END>>');
    expect(r.card).toEqual({ kind: 'guided_start' });
  });

  it('misvormde JSON → nog steeds een card, zonder datum', () => {
    const r = extractGuidedStart('<<FILLY_START_GUIDED>>{date: zondag}<<END>>');
    expect(r.card).toEqual({ kind: 'guided_start' });
  });

  it('datum in het verleden wordt afgewezen', () => {
    const r = extractGuidedStart(
      '<<FILLY_START_GUIDED>>{"date":"2020-01-01"}<<END>>',
    );
    expect(r.card?.date).toBeUndefined();
  });

  it('datum >120 dagen vooruit wordt afgewezen', () => {
    const far = new Date(Date.now() + 200 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = extractGuidedStart(
      `<<FILLY_START_GUIDED>>{"date":"${far}"}<<END>>`,
    );
    expect(r.card?.date).toBeUndefined();
  });

  it('day_phrase wordt deterministisch omgerekend (morgen → +1 dag)', () => {
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = extractGuidedStart(
      '<<FILLY_START_GUIDED>>{"day_phrase":"morgen"}<<END>>',
    );
    expect(r.card?.date).toBe(tomorrow);
  });

  it('onherleidbare day_phrase → card zonder datum', () => {
    const r = extractGuidedStart(
      '<<FILLY_START_GUIDED>>{"day_phrase":"ooit eens"}<<END>>',
    );
    expect(r.card).toEqual({ kind: 'guided_start' });
  });

  it('topic wordt gecapt op 80 tekens', () => {
    const long = 'a'.repeat(200);
    const r = extractGuidedStart(
      `<<FILLY_START_GUIDED>>{"topic":"${long}"}<<END>>`,
    );
    expect(r.card?.topic?.length).toBe(80);
  });
});

// ============================================================
// active_action — gedeelde "lopende actie"-state (audit-item #8)
// ============================================================

describe('mergeActiveAction', () => {
  it('delta over null → start een verse actie', () => {
    expect(mergeActiveAction(null, { date: '2026-06-17' })).toEqual({
      date: '2026-06-17',
    });
  });

  it('topic-only delta laat de bestaande datum ongemoeid (de kern-bug)', () => {
    // Faal-scenario: dag is al gekozen (wo 17), eigenaar typt "buratta".
    // De topic-delta mag de datum NIET wissen.
    const prev = { date: '2026-06-17', step: 'channels' };
    expect(mergeActiveAction(prev, { topic: 'Burrata' })).toEqual({
      date: '2026-06-17',
      step: 'channels',
      topic: 'Burrata',
    });
  });

  it('een nieuwe datum overschrijft de oude', () => {
    const prev = { date: '2026-06-17', topic: 'Burrata' };
    expect(mergeActiveAction(prev, { date: '2026-06-20' })).toEqual({
      date: '2026-06-20',
      topic: 'Burrata',
    });
  });

  it('lege delta → ongewijzigde kopie', () => {
    const prev = { date: '2026-06-17', channels: ['mail'] };
    const out = mergeActiveAction(prev, {});
    expect(out).toEqual(prev);
    expect(out).not.toBe(prev); // pure: nieuwe referentie
  });
});

describe('sanitizeActionInput', () => {
  it('geldige ISO-datum wordt overgenomen; niet-gestuurde velden weggelaten', () => {
    expect(sanitizeActionInput({ date: '2026-06-17' })).toEqual({
      date: '2026-06-17',
    });
  });

  it('ongeldige datum wordt geweerd', () => {
    expect(sanitizeActionInput({ date: 'zondag' })).toEqual({});
    expect(sanitizeActionInput({ date: '17-06-2026' })).toEqual({});
  });

  it('topic wordt getrimd + gecapt op 80', () => {
    const out = sanitizeActionInput({ topic: '  ' + 'x'.repeat(200) });
    expect(out.topic?.length).toBe(80);
  });

  it('kanalen worden gefilterd op de whitelist + ontdubbeld', () => {
    expect(
      sanitizeActionInput({
        channels: ['mail', 'instagram', 'mail', 'hacker', 42],
      }).channels,
    ).toEqual(['mail', 'instagram']);
  });

  it('niet-array channels → veld weggelaten', () => {
    expect(sanitizeActionInput({ channels: 'mail' }).channels).toBeUndefined();
  });
});

describe('detectCampaignHint', () => {
  it('campagne-vraag ("welke dagen stel je voor") → stuurt naar de geleide flow', () => {
    const hint = detectCampaignHint(
      'welke dagen stel je voor om een campagne te maken',
    );
    expect(hint).toContain('FILLY_START_GUIDED');
    expect(hint).toContain('Som NOOIT dagen');
    // De legacy FORMAAT-steering mag NIET meer terugkomen.
    expect(hint).not.toMatch(/FORMAAT|FILLY_PROPOSE_CHOICE/);
  });

  it('expliciet maak-verzoek → hint', () => {
    expect(detectCampaignHint('maak een actie voor zondag')).toContain(
      'FILLY_START_GUIDED',
    );
  });

  it('"wat raad je aan" → hint', () => {
    expect(detectCampaignHint('wat raad je aan?')).toContain(
      'FILLY_START_GUIDED',
    );
  });

  it('niet-campagne-bericht → null', () => {
    expect(detectCampaignHint('hoe laat zijn jullie open?')).toBeNull();
    expect(detectCampaignHint('bedankt!')).toBeNull();
  });
});

describe('formatActiveActionBlock', () => {
  it('null of lege actie → lege string (geen promptblok)', () => {
    expect(formatActiveActionBlock(null)).toBe('');
    expect(formatActiveActionBlock({})).toBe('');
    expect(formatActiveActionBlock({ step: 'channels', channels: [] })).toBe(
      '',
    );
  });

  it('datum + topic → blok met instructie de dag niet opnieuw te vragen', () => {
    const block = formatActiveActionBlock({
      date: '2026-06-17',
      topic: 'Burrata',
    });
    expect(block).toContain('[LOPENDE ACTIE');
    expect(block).toContain('doel-datum: 2026-06-17');
    expect(block).toContain('thema/gerecht: Burrata');
    expect(block).toContain('vraag de dag NIET opnieuw');
  });

  it('alleen kanalen (nog geen datum) → toont "nog niet gekozen"', () => {
    const block = formatActiveActionBlock({ channels: ['mail', 'facebook'] });
    expect(block).toContain('doel-datum: nog niet gekozen');
    expect(block).toContain('gekozen kanalen: mail, facebook');
  });
});
