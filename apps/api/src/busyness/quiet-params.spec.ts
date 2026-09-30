import { QUIET_PARAMS } from './quiet-params';

// De standaardwaarden zijn het huidige, live gedrag. Wijzigt iemand er een,
// dan faalt deze test en is het een bewuste keuze (en niet per ongeluk).
describe('QUIET_PARAMS standaardwaarden', () => {
  it('zijn gelijk aan de waarden van voor de centralisatie', () => {
    expect(QUIET_PARAMS).toEqual({
      minCoverage: 2,
      gapFloor: 15,
      edgeActivityFrac: 0.3,
      absDevFloor: 2,
      anomalyWeight: 0.5,
      unusualSpreadMult: 2.0,
      defaultPerWeek: 2,
    });
  });
});
