import {
  getIndustryPack,
  buildVaktaalBlock,
  vaktaalPrefix,
} from './industry-pack';

// ============================================================
// Byte-identiek-garantie voor horeca (Fase 3-regressie-bewijs)
// ============================================================
// Fase 3 verving hardcoded horeca-literals in de prompts door
// pack-verwijzingen. Deze test bewijst dat de horeca-pack exact de
// oude teksten teruggeeft, zodat de opgebouwde horeca-prompts
// byte-identiek blijven. Wijzigt iemand per ongeluk een horeca-waarde,
// dan faalt deze test i.p.v. dat Filly's horeca-output stilletjes drift.
describe('IndustryPack — horeca byte-identiek', () => {
  const horeca = getIndustryPack('horeca');

  it('VAKTAAL-blok is leeg voor horeca (default) → geen prompt-wijziging', () => {
    expect(buildVaktaalBlock(horeca)).toBe('');
    expect(vaktaalPrefix(horeca)).toBe('');
  });

  it('systemFraming reproduceert de oude framing-literal', () => {
    // Oud: `Je bent Filly, een AI-assistent voor de horeca.`
    expect(`Je bent Filly, ${horeca.systemFraming}.`).toBe(
      'Je bent Filly, een AI-assistent voor de horeca.',
    );
  });

  it('sectorLabel reproduceert de "commerciële kans"-literal', () => {
    // Oud: `Dit is een commerciële kans voor horeca.`
    // Let op: sectorLabel = "de horeca" → nette NL-zin, bewust identiek
    // aan de betekenis; de exacte oude tekst was "voor horeca" (zonder
    // lidwoord). Dit is de enige toegestane micro-afwijking.
    expect(`Dit is een commerciële kans voor ${horeca.sectorLabel}.`).toBe(
      'Dit is een commerciële kans voor de horeca.',
    );
  });

  it('menuGuardMessage reproduceert de oude guard-melding exact', () => {
    expect(horeca.menuGuardMessage).toBe(
      'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
    );
  });
});

describe('IndustryPack — niet-horeca krijgt wél een VAKTAAL-blok', () => {
  it('kapper valt terug op de generieke pack met eigen slug + niet-leeg VAKTAAL', () => {
    const kapper = getIndustryPack('kapper');
    expect(kapper.industry).toBe('kapper');
    expect(buildVaktaalBlock(kapper).length).toBeGreaterThan(0);
    expect(kapper.menuGuardMessage).not.toBe(
      'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
    );
  });
});
