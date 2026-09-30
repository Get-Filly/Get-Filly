import { planPostTime } from './post-timing';
import { amsterdamIsoAtHour } from '../common/date-nl';

// Alle tijden hieronder zijn Amsterdamse wandkloktijd (oktober 2026 = zomertijd).
const at = (date: string, hour: number) =>
  new Date(amsterdamIsoAtHour(date, hour));
const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
      }).format(new Date(iso))
    : null;

describe('planPostTime', () => {
  it('plaatst Instagram de dag ervoor rond lunchtijd voor een middagmoment (niet erna)', () => {
    // Dinsdag 6 oktober, venster begint 15:00; nu is maandag 5 oktober 10:00.
    const plan = planPostTime(
      'instagram_feed',
      amsterdamIsoAtHour('2026-10-06', 15),
      at('2026-10-05', 10),
    );
    expect(plan.skip).toBe(false);
    expect(Date.parse(plan.scheduledFor!)).toBeLessThan(
      Date.parse(amsterdamIsoAtHour('2026-10-06', 15)),
    );
    expect(fmt(plan.scheduledFor)).toContain('12:00');
    expect(fmt(plan.scheduledFor)).toContain('05'); // maandag 5 oktober
    expect(plan.urgencyInCopy).toBe(false);
  });

  it('gebruikt bij ruim de tijd het optimale bereik (24 tot 72 uur) en niet weken vooruit', () => {
    const plan = planPostTime(
      'instagram_feed',
      amsterdamIsoAtHour('2026-10-20', 18),
      at('2026-10-05', 10),
    );
    const uur =
      (Date.parse(amsterdamIsoAtHour('2026-10-20', 18)) -
        Date.parse(plan.scheduledFor!)) /
      3_600_000;
    expect(uur).toBeGreaterThanOrEqual(24);
    expect(uur).toBeLessThan(48);
  });

  it('gaat zo snel mogelijk met urgentie als er minder is dan het optimale bereik', () => {
    // Vandaag 10:00, moment vandaag 19:00 (9 uur): boven het minimum van 6, onder de 24.
    const plan = planPostTime(
      'instagram_feed',
      amsterdamIsoAtHour('2026-10-05', 19),
      at('2026-10-05', 10),
    );
    expect(plan.skip).toBe(false);
    expect(plan.urgencyInCopy).toBe(true);
    expect(plan.classification).toBe('onder_optimaal');
    expect(Date.parse(plan.scheduledFor!)).toBeGreaterThan(
      at('2026-10-05', 10).getTime(),
    );
  });

  it('slaat een kanaal over dat te laat is (Facebook heeft minimaal 12 uur nodig)', () => {
    const plan = planPostTime(
      'facebook',
      amsterdamIsoAtHour('2026-10-05', 19),
      at('2026-10-05', 10),
    );
    expect(plan.skip).toBe(true);
    expect(plan.scheduledFor).toBeNull();
    expect(plan.classification).toBe('onder_minimum');
  });

  it('plaatst nooit in het verleden of vóór de goedkeuringstijd', () => {
    const now = at('2026-10-05', 10);
    for (const ch of ['instagram_feed', 'tiktok', 'google_business'] as const) {
      const plan = planPostTime(ch, amsterdamIsoAtHour('2026-10-07', 17), now);
      if (!plan.skip)
        expect(Date.parse(plan.scheduledFor!)).toBeGreaterThanOrEqual(
          now.getTime() + 3_600_000,
        );
    }
  });

  it('plaatst nooit later dan het vroegste-inplanning-moment', () => {
    const w = Date.parse(amsterdamIsoAtHour('2026-10-06', 15));
    const plan = planPostTime(
      'google_business',
      amsterdamIsoAtHour('2026-10-06', 15),
      at('2026-10-05', 10),
    );
    expect(plan.skip).toBe(false);
    expect(w - Date.parse(plan.scheduledFor!)).toBeGreaterThanOrEqual(
      12 * 3_600_000,
    );
  });
});
