import {
  naturalizeDashes,
  naturalizeSuggestedCampaign,
} from './copy-style.guard';

describe('naturalizeDashes', () => {
  it('spaced em-dash als zinsverbinder → komma', () => {
    expect(naturalizeDashes('op adem komen — dat klinkt goed')).toBe(
      'op adem komen, dat klinkt goed',
    );
  });

  it('en-dash idem', () => {
    expect(naturalizeDashes('rustig en gezellig – kom langs')).toBe(
      'rustig en gezellig, kom langs',
    );
  });

  it('dash zonder spaties tussen woorden → komma met spatie', () => {
    expect(naturalizeDashes('Barolo-selectie—want trots')).toBe(
      'Barolo-selectie, want trots',
    );
  });

  it('dash aan zin-eind → geen dangling komma', () => {
    expect(naturalizeDashes('of iets anders —')).toBe('of iets anders');
  });

  it('laat het gewone koppelteken in samenstellingen met rust', () => {
    expect(naturalizeDashes('een 3-gangen menu in Oud-Zuid')).toBe(
      'een 3-gangen menu in Oud-Zuid',
    );
  });

  it('laat de decimaal-komma met rust (geen spatie forceren)', () => {
    expect(naturalizeDashes('Bundelprijs 12,50 per persoon')).toBe(
      'Bundelprijs 12,50 per persoon',
    );
  });

  it('meerdere dashes in één tekst', () => {
    expect(
      naturalizeDashes('Hoi — fijn dat je er bent — kom snel langs'),
    ).toBe('Hoi, fijn dat je er bent, kom snel langs');
  });

  it('lege/ongewijzigde input', () => {
    expect(naturalizeDashes('')).toBe('');
    expect(naturalizeDashes('gewone zin zonder streepjes')).toBe(
      'gewone zin zonder streepjes',
    );
  });
});

describe('naturalizeSuggestedCampaign', () => {
  it('poetst dashes uit alle geneste copy-velden', () => {
    const sc = {
      name: 'Actie — woensdag',
      subject_line: 'Tafel vrij — kom langs',
      body: 'Eerste zin — tweede zin.',
      channels: [
        {
          platform: 'mail',
          variants: [{ body: 'Variant — met dash', subject_line: 'Sub – line' }],
        },
      ],
    };
    expect(naturalizeSuggestedCampaign(sc)).toEqual({
      name: 'Actie, woensdag',
      subject_line: 'Tafel vrij, kom langs',
      body: 'Eerste zin, tweede zin.',
      channels: [
        {
          platform: 'mail',
          variants: [{ body: 'Variant, met dash', subject_line: 'Sub, line' }],
        },
      ],
    });
  });

  it('laat niet-string-velden (getallen/booleans/null) ongemoeid', () => {
    const sc = {
      body: 'tekst — hier',
      selected_index: 0,
      enabled: true,
      note: null,
    };
    expect(naturalizeSuggestedCampaign(sc)).toEqual({
      body: 'tekst, hier',
      selected_index: 0,
      enabled: true,
      note: null,
    });
  });
});
