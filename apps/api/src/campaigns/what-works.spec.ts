import {
  CampaignReportService,
  type CampaignReportRow,
} from './campaign-report.service';

// ============================================================
// "Wat werkt bij jou" — de rekenregel
// ============================================================
// Dit blok geeft een oordeel over een kanaal. Dat is precies het soort
// uitspraak waar een rapportage vertrouwen mee verspeelt als de onderbouwing
// dun is, dus staan de twee regels die dat moeten voorkomen hier vast:
//   1. onder het minimum aantal gescoorde uitingen géén oordeel;
//   2. mediaan, niet gemiddelde, zodat één uitschieter een kanaal niet maakt
//      of breekt.

// Toegang tot de private methode; dit is puur rekenwerk zonder Supabase.
const svc = new CampaignReportService({} as never) as unknown as {
  whatWorks: (rows: CampaignReportRow[]) => Array<{
    channel: string;
    uitingen: number;
    medianScore: number | null;
    bookings: number;
    counts: boolean;
    verdict: 'sterk' | 'gemiddeld' | 'zwak' | null;
  }>;
};

function uiting(
  channel: string,
  success_score: number | null,
  extra: Partial<CampaignReportRow> = {},
): CampaignReportRow {
  return {
    campaign_id: Math.random().toString(36).slice(2),
    campaign_name: 'test',
    channel,
    status: 'afgerond',
    happened_at: '2026-09-01T12:00:00Z',
    paid: false,
    reach: 100,
    clicks: 10,
    interactions: 5,
    bookings: 1,
    guests: 2,
    revenue_cents: 0,
    spend_cents: 0,
    cost_per_booking_cents: null,
    roas: null,
    success_score,
    classification: null,
    score_basis: null,
    marked_outlier: false,
    ...extra,
  } as CampaignReportRow;
}

describe('whatWorks', () => {
  it('geeft geen oordeel onder het minimum aantal gescoorde uitingen', () => {
    const rows = [uiting('tiktok', 90), uiting('tiktok', 95)];
    const [r] = svc.whatWorks(rows);
    expect(r.uitingen).toBe(2);
    expect(r.counts).toBe(false);
    expect(r.verdict).toBeNull();
    // De mediaan mag wél berekend zijn; de UI toont 'm alleen niet als
    // oordeel. Zo blijft zichtbaar dat er iets is, zonder conclusie.
    expect(r.medianScore).toBe(93);
  });

  it('geeft vanaf drie gescoorde uitingen wel een oordeel', () => {
    const rows = [
      uiting('facebook', 70),
      uiting('facebook', 80),
      uiting('facebook', 90),
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.counts).toBe(true);
    expect(r.medianScore).toBe(80);
    expect(r.verdict).toBe('sterk');
  });

  it('gebruikt de mediaan, zodat één uitschieter het kanaal niet maakt', () => {
    // Gemiddelde zou 47 zijn (gemiddeld), mediaan is 20 (zwak). De drie
    // magere posts zijn het eerlijke beeld.
    const rows = [
      uiting('instagram', 15),
      uiting('instagram', 20),
      uiting('instagram', 25),
      uiting('instagram', 128),
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.medianScore).toBe(23); // mediaan van 20 en 25
    expect(r.verdict).toBe('zwak');
  });

  it('telt uitingen zonder score wel mee als uiting, niet in de score', () => {
    const rows = [
      uiting('facebook', 70),
      uiting('facebook', 80),
      uiting('facebook', 90),
      uiting('facebook', null), // nog niet gescoord
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.uitingen).toBe(4);
    expect(r.medianScore).toBe(80); // de lege telt niet mee
    expect(r.counts).toBe(true);
  });

  it('laat gemarkeerde uitschieters buiten de score', () => {
    const rows = [
      uiting('facebook', 70),
      uiting('facebook', 80),
      uiting('facebook', 90),
      uiting('facebook', 100, { marked_outlier: true }),
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.uitingen).toBe(4);
    expect(r.medianScore).toBe(80);
  });

  it('zakt naar geen-oordeel als er te weinig gescoorde uitingen overblijven', () => {
    // Vier uitingen, maar drie zonder score: dan is er geen basis.
    const rows = [
      uiting('tiktok', 90),
      uiting('tiktok', null),
      uiting('tiktok', null),
      uiting('tiktok', null),
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.uitingen).toBe(4);
    expect(r.counts).toBe(false);
  });

  it('zet kanalen met een oordeel vooraan, daarbinnen op score', () => {
    const rows = [
      ...[40, 45, 50].map((v) => uiting('instagram', v)),
      ...[70, 80, 90].map((v) => uiting('facebook', v)),
      uiting('tiktok', 99), // te weinig
    ];
    const namen = svc.whatWorks(rows).map((r) => r.channel);
    expect(namen).toEqual(['facebook', 'instagram', 'tiktok']);
  });

  it('telt boekingen op over alle uitingen van het kanaal', () => {
    const rows = [
      uiting('facebook', 70, { bookings: 3 }),
      uiting('facebook', 80, { bookings: 4 }),
      uiting('facebook', null, { bookings: 5 }),
    ];
    const [r] = svc.whatWorks(rows);
    expect(r.bookings).toBe(12);
  });

  it('geeft niets terug zonder uitingen', () => {
    expect(svc.whatWorks([])).toEqual([]);
  });
});
