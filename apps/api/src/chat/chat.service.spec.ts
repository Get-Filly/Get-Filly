import { extractGuidedStart } from './chat.service';

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

  it('topic wordt gecapt op 80 tekens', () => {
    const long = 'a'.repeat(200);
    const r = extractGuidedStart(
      `<<FILLY_START_GUIDED>>{"topic":"${long}"}<<END>>`,
    );
    expect(r.card?.topic?.length).toBe(80);
  });
});
