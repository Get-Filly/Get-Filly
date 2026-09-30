import { QUIET_PARAMS, SIGNAL_PARAMS } from './quiet-params';

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
      holidayBonusWeight: 0.5,
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

describe('SIGNAL_PARAMS standaardwaarden', () => {
  it('zijn de waarden uit de literatuur waarmee het model live ging', () => {
    expect(SIGNAL_PARAMS).toEqual({
      weatherWarmMinC: 22,
      weatherHeatMinC: 30,
      weatherColdMaxC: 8,
      weatherTerraceBoost: 1.25,
      weatherWarmBoost: 1.1,
      weatherWetDamp: 0.85,
      weatherColdDamp: 0.88,
      weatherHeatDamp: 0.9,
      eventWeight: {
        festivals: 1.0,
        concerten_theater: 0.8,
        sportevenementen: 0.8,
        events: 0.6,
        kermis: 0.4,
        markten: 0.4,
      },
      eventDefaultWeight: 0.6,
      eventMaxBoost: 0.5,
      eventFactorCeil: 1.6,
      eventRadiusKm: {
        kermis: 2,
        markten: 2,
        concerten_theater: 5,
        sportevenementen: 5,
        events: 5,
        festivals: 10,
      },
      incidentalMinDamp: 0.08,
    });
  });
});
