import { HORECA_PACK } from './horeca-taal';

// Byte-identiek-garantie: dit zijn de letterlijke teksten die voor de
// opruiming van de branche-code in Filly's horeca-prompts stonden.
describe('HORECA_PACK', () => {
  it('systemFraming reproduceert de oude framing-literal', () => {
    expect(`Je bent Filly, ${HORECA_PACK.systemFraming}.`).toBe(
      'Je bent Filly, een AI-assistent voor de horeca.',
    );
  });

  it('sectorLabel reproduceert de "commerciële kans"-literal', () => {
    expect(`Dit is een commerciële kans voor ${HORECA_PACK.sectorLabel}.`).toBe(
      'Dit is een commerciële kans voor de horeca.',
    );
  });

  it('menuGuardMessage reproduceert de oude guard-melding exact', () => {
    expect(HORECA_PACK.menuGuardMessage).toBe(
      'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
    );
  });
});
