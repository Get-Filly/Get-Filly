import { QUIET_PARAMS } from './quiet-params';

// De standaardwaarden zijn het huidige, live gedrag. Wijzigt iemand er een,
// dan faalt deze test en is het een bewuste keuze (en niet per ongeluk).
describe('QUIET_PARAMS standaardwaarden', () => {
  it('zijn de vastgestelde waarden (docs/werking/rustige-momenten-model-v2.docx)', () => {
    expect(QUIET_PARAMS).toEqual({
      openMarginHours: 1,
      closeMarginHours: 2,
      windowHours: 2,
      gapFrac: 0.35,
      anomalyWeight: 0.5,
      unusualSpreadMult: 2.0,
      relDevFloor: 0.12,
      eventBonusWeight: 0.5,
      exceptionScore: 0.8,
      haalbaarheid: {
        ochtend: [0.3, 0.3, 0.3, 0.3, 0.4, 0.7, 0.7],
        lunch: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
        middag: [0.85, 0.85, 0.85, 0.85, 0.85, 1, 1],
        diner: [0.85, 0.85, 0.85, 0.85, 0.95, 1, 1],
      },
      minCoverage: 2,
      defaultPerWeek: 2,
    });
  });
});
