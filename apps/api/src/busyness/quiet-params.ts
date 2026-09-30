/**
 * ============================================================
 * Parameters van de rustige-momenten-detectie (groep A)
 * ============================================================
 *
 * Eén plek voor de getallen die bepalen WANNEER een dagdeel een kans is.
 * Uitleg in gewone taal per parameter, zodat je ze zonder codezoektocht kunt
 * aanpassen. `getQuietMoments` leest deze standaardwaarden; de
 * speeltuin (en tests) kunnen ze per aanroep overschrijven.
 */
export interface QuietParams {
  /**
   * Minimaal aantal open uren binnen een dagdeel voordat het meetelt.
   * Voorkomt dat een dagdeel waarin je maar een uur open bent een "kans" wordt.
   */
  minCoverage: number;
  /**
   * Kansdrempel: hoeveel punten een dagdeel onder je EIGEN drukste dagdeel
   * (de piek) moet zitten om te tellen als iets wat je kunt vullen. Hoger =
   * strenger (alleen echt lege momenten), lager = meer momenten komen in aanmerking.
   */
  gapFloor: number;
  /**
   * Het eerste en laatste open dagdeel (opening en afsluiting) telt alleen mee
   * als het minstens dit deel van je piek haalt. Anders is het de dode rand van
   * je dienst en geen kans.
   */
  edgeActivityFrac: number;
  /**
   * Ondergrens (in punten) voor de "normale schommeling". Vangt zaken af waar
   * het patroon zo vlak is dat de schommeling bijna nul zou worden.
   */
  absDevFloor: number;
  /**
   * Hoe zwaar een "ongewoon rustig" dagdeel maximaal extra meetelt in de
   * rangschikking, bovenop hoeveel er te vullen valt. Het label
   * "ongewoon rustig" zelf hangt aan unusualSpreadMult.
   */
  anomalyWeight: number;
  /**
   * Vanaf hoeveel keer de normale schommeling een dagdeel "ongewoon rustig"
   * heet (in plaats van "doorgaans rustig").
   */
  unusualSpreadMult: number;
  /**
   * Tempo: maximaal aantal rustige dagen dat Filly per week aandraagt als de
   * zaak zelf niets heeft ingesteld (per zaak instelbaar, mig 0065, 1 tot 6).
   */
  defaultPerWeek: number;
}

export const QUIET_PARAMS: QuietParams = {
  minCoverage: 2,
  gapFloor: 15,
  edgeActivityFrac: 0.3,
  absDevFloor: 2,
  anomalyWeight: 0.5,
  unusualSpreadMult: 2.0,
  defaultPerWeek: 2,
};
