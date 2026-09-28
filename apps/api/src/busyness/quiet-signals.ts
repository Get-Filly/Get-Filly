/**
 * ============================================================
 * Datum-signalen + beleidsfactoren voor de rustige-momenten-detectie
 * ============================================================
 *
 * Waarom dit bestand bestaat
 * --------------------------
 * `getQuietMoments` rekende tot 2026-09-15 uitsluitend op het Google-
 * weekpatroon. Dat patroon is per weekdag constant, dus de score van
 * "maandag lunch" was een constante en de detectie wees elke week exact
 * dezelfde weekdagen aan. Dat oogt als een opzoektabel, niet als een model.
 *
 * Hier staan de twee lagen die daar per KALENDERDATUM verschil in maken:
 *
 *   1. busynessFactor — hoeveel drukker/rustiger wordt deze datum dan het
 *      weekpatroon zegt? Bron: weer (Open-Meteo, 7 dagen) en evenementen in
 *      de buurt (evenementen.nl via de events-tabel). Deze factor gaat op de
 *      VERWACHTE DRUKTE, niet op de score. Dat is het verschil tussen "een
 *      andere volgorde van dezelfde vaste lijst" en een echte incidentele
 *      kans: een vrijdag met te weinig gat om kandidaat te zijn, kan door
 *      een storm alsnog over de drempel komen.
 *
 *   2. cooldownFactor — hoe zwaar telt een weekdag×dagdeel-combinatie nog
 *      mee als we 'm recent al gebruikt hebben? Dempend, nooit uitsluitend:
 *      hard uitsluiten bouwt gewoon een ander vast patroon.
 *
 * Bewust GEEN willekeur. Elke afwijking van de hoogste score heeft een
 * reden die in één zin op te schrijven is; die reden reist als reasonKey +
 * reasonParams mee naar het dashboard en de chat.
 *
 * Alles hier is puur (geen IO), zodat het zonder Supabase en zonder netwerk
 * te testen is.
 */

// ============================================================
// Dagdeel-rooster
// ============================================================

// Vaste dagdeel-vensters (uur-grenzen, [from, to)). Een dagdeel wordt per zaak
// bijgesneden op de open uren (uren met patroon > 0); dagdelen zonder genoeg
// open uren tellen niet mee. Zo krijgt een lunchroom wél ochtend en een
// dinner-only zaak niet.
//
// Staat hier, in het bron-loze module, en niet in busyness.service.ts: de
// meetservice (quiet-feedback) heeft het rooster óók nodig, en een import
// over en weer tussen die twee services levert een module-cyclus op waar
// NestJS' DI op stukloopt (de constructor-metadata wordt dan undefined).
export const DAYPART_DEFS: {
  key: string;
  label: string;
  from: number;
  to: number;
}[] = [
  { key: 'ochtend', label: 'ochtend', from: 6, to: 11 },
  { key: 'lunch', label: 'lunch', from: 11, to: 14 },
  { key: 'middag', label: 'middag', from: 14, to: 17 },
  { key: 'diner', label: 'diner', from: 17, to: 21 },
  { key: 'avond', label: 'avond', from: 21, to: 24 },
];

// ============================================================
// Typen
// ============================================================

export type WeatherSignal = {
  tempMin: number;
  tempMax: number;
  /** WMO-weercode zoals Open-Meteo 'm geeft. */
  code: number;
};

export type EventSignal = {
  name: string;
  category: string;
  place: string;
  distanceKm: number;
  /** De staffel-radius die voor dit event geldt (categorie of eigenaar-keuze). */
  radiusKm: number;
};

/** Waarom is juist deze dag een kans? Key + params, want de UI is NL/EN. */
export type QuietReason = {
  reasonKey:
    | 'structural' // doorgaans rustig op deze weekdag
    | 'structuralRotated' // doorgaans rustig, gekozen omdat het vaste slot recent al gebruikt is
    | 'unusual' // rustiger dan deze zaak op dit moment normaal is
    | 'weatherRain' // regen/storm houdt mensen thuis
    | 'weatherCold' // kou houdt mensen thuis
    | 'weatherHeat' // hitte: bezoek daalt
    | 'eventNearby'; // evenement vlakbij trekt publiek weg/aan
  reasonParams: Record<string, string | number>;
};

export type QuietNoteReason = 'feestdag' | 'al_afgedekt';

/** Een dag die kandidaat was maar door een harde poort afvalt. */
export type QuietNote = {
  date: string;
  reason: QuietNoteReason;
  /** Naam van de feestdag, als reason='feestdag'. */
  label?: string;
};

// ============================================================
// Weer
// ============================================================

// Spiegelt WEATHER_TIMING_RULES in ai/timing-factors.ts, zodat de detectie
// en de prompt niet tegenstrijdig kunnen worden. Factor > 1 = DRUKKER dan
// het patroon zegt, < 1 = rustiger. Temperatuur weegt zwaarder dan regen
// (zie de onderbouwing bij WEATHER_TIMING_RULES).
const WEATHER_WARM_MIN_C = 22;
const WEATHER_HEAT_MIN_C = 30;
const WEATHER_COLD_MAX_C = 8;
const WEATHER_TERRACE_BOOST = 1.25; // terrasweer + eigen terras
const WEATHER_WARM_BOOST = 1.1; // terrasweer zonder terras
const WEATHER_WET_DAMP = 0.85; // regen/buien/onweer
const WEATHER_COLD_DAMP = 0.88;
const WEATHER_HEAT_DAMP = 0.9; // hittegolf: mensen blijven binnen

const isDryCode = (code: number) => code <= 2; // 0 zonnig, 1, 2 deels bewolkt
const isWetCode = (code: number) => (code >= 61 && code <= 82) || code >= 95; // regen, buien, onweer

/**
 * Drukte-factor uit de weersverwachting van één dag. 1 = geen signaal.
 * Alleen zinvol binnen de 7-daagse Open-Meteo-horizon; daarbuiten geeft de
 * caller geen WeatherSignal mee en is de factor dus vanzelf 1.
 */
export function weatherBusynessFactor(
  w: WeatherSignal | null,
  hasTerrace: boolean,
): { factor: number; reason: QuietReason | null } {
  if (!w) return { factor: 1, reason: null };

  if (w.tempMax > WEATHER_HEAT_MIN_C) {
    return {
      factor: WEATHER_HEAT_DAMP,
      reason: { reasonKey: 'weatherHeat', reasonParams: { temp: w.tempMax } },
    };
  }
  if (isWetCode(w.code)) {
    return {
      factor: WEATHER_WET_DAMP,
      reason: { reasonKey: 'weatherRain', reasonParams: {} },
    };
  }
  if (w.tempMax <= WEATHER_COLD_MAX_C) {
    return {
      factor: WEATHER_COLD_DAMP,
      reason: { reasonKey: 'weatherCold', reasonParams: { temp: w.tempMax } },
    };
  }
  if (isDryCode(w.code) && w.tempMax >= WEATHER_WARM_MIN_C) {
    return {
      factor: hasTerrace ? WEATHER_TERRACE_BOOST : WEATHER_WARM_BOOST,
      reason: null, // drukker dan normaal is geen reden om de dag te kiezen
    };
  }
  return { factor: 1, reason: null };
}

// ============================================================
// Evenementen
// ============================================================

// De events-tabel (mig 0053) heeft géén bezoekersaantal en géén einddatum.
// "Groot" is dus niet afleesbaar; we benaderen het met categorie × nabijheid.
// Een meerdaags festival matcht daardoor alleen z'n startdag — bekende
// beperking van de bron, niet van deze rekenregel.
const EVENT_WEIGHT: Record<string, number> = {
  festivals: 1.0,
  concerten_theater: 0.8,
  sportevenementen: 0.8,
  events: 0.6,
  kermis: 0.4,
  markten: 0.4,
};
const EVENT_DEFAULT_WEIGHT = 0.6;
const EVENT_MAX_BOOST = 0.5; // een festival op de stoep: tot +50% drukte
const EVENT_FACTOR_CEIL = 1.6;

/**
 * Drukte-factor uit de evenementen op één datum. Meerdere events stapelen
 * (multiplicatief), met een plafond. De reden noemt het zwaarste event.
 */
export function eventBusynessFactor(events: EventSignal[]): {
  factor: number;
  reason: QuietReason | null;
} {
  let factor = 1;
  let strongest: EventSignal | null = null;
  let strongestBoost = 0;

  for (const e of events) {
    const radius = e.radiusKm > 0 ? e.radiusKm : 5;
    // Lineair van 1 op de stoep naar 0 op de staffel-grens.
    const proximity = Math.max(0, 1 - e.distanceKm / radius);
    const boost =
      EVENT_MAX_BOOST *
      (EVENT_WEIGHT[e.category] ?? EVENT_DEFAULT_WEIGHT) *
      proximity;
    if (boost <= 0) continue;
    factor *= 1 + boost;
    if (boost > strongestBoost) {
      strongestBoost = boost;
      strongest = e;
    }
  }

  factor = Math.min(EVENT_FACTOR_CEIL, factor);
  if (!strongest) return { factor: 1, reason: null };
  return {
    factor,
    reason: {
      reasonKey: 'eventNearby',
      reasonParams: {
        name: strongest.name,
        category: strongest.category,
        place: strongest.place,
        distanceKm: strongest.distanceKm,
      },
    },
  };
}

// ============================================================
// Gecombineerde datum-factor
// ============================================================

const FACTOR_FLOOR = 0.7;
const FACTOR_CEIL = 1.6;
/** Vanaf hoeveel afwijking van 1 noemen we een dag incidenteel i.p.v. structureel. */
export const INCIDENTAL_MIN_DAMP = 0.08;

export type DateSignals = {
  weather: WeatherSignal | null;
  events: EventSignal[];
};

/**
 * De drukte-factor voor één kalenderdatum. > 1 = drukker dan het weekpatroon
 * zegt (minder kans), < 1 = rustiger (meer kans). Deze gaat op de VERWACHTE
 * DRUKTE vóór de gap-poort, niet op de eindscore — anders kan een signaal
 * alleen herschikken en nooit een kans laten ontstaan.
 */
export function dateBusynessFactor(
  signals: DateSignals,
  hasTerrace: boolean,
): { factor: number; reason: QuietReason | null } {
  const w = weatherBusynessFactor(signals.weather, hasTerrace);
  const e = eventBusynessFactor(signals.events);
  const factor = Math.min(
    FACTOR_CEIL,
    Math.max(FACTOR_FLOOR, w.factor * e.factor),
  );

  // De reden is het signaal dat het verst van 1 af ligt. Een event dat de
  // dag drúkker maakt is ook een reden (het verklaart de rangorde), maar
  // een weersignaal dat de dag rustiger maakt gaat voor: dat is wat de dag
  // tot kans maakt.
  const wDelta = Math.abs(w.factor - 1);
  const eDelta = Math.abs(e.factor - 1);
  let reason: QuietReason | null = null;
  if (w.reason && (wDelta >= eDelta || !e.reason)) reason = w.reason;
  else if (e.reason) reason = e.reason;

  return { factor, reason };
}

// ============================================================
// Cool-down
// ============================================================

/** Hoeveel weken terug we kijken voor de cool-down. */
export const COOLDOWN_WEEKS = 3;
const COOLDOWN_STRENGTH = 0.6; // demping op een slot dat DEZE week al gebruikt is
const COOLDOWN_WEAK_STRENGTH = 0.3; // idem, maar als we alleen de weekdag kennen
const COOLDOWN_DECAY = 0.5; // halvering per week ouderdom
const COOLDOWN_FLOOR = 0.25; // ondergrens: blijft demping, wordt nooit uitsluiting
/** Zelfde dagdeel, zelfde week: milde spreidings-voorkeur. */
export const SAME_WEEK_DAYPART_DAMP = 0.85;

export type SlotHit = {
  /** 0 = in dezelfde week, 1 = week ervoor, … */
  weeksAgo: number;
  /**
   * true als we alleen de weekdag kennen en niet het dagdeel (campagne
   * zonder gekoppelde suggestie: campaigns.scheduled_for is het VERZEND-
   * moment, niet het doelmoment — daar is geen dagdeel uit af te leiden).
   */
  weak?: boolean;
};

/**
 * Dempingsfactor voor een weekdag×dagdeel-slot op basis van recent gebruik.
 *
 * Waarom multiplicatief en niet aftrekkend: de basisscore is
 * `gap/piek + 0,5·anomalie/spreiding` en de spreiding verschilt per zaak.
 * Een vaste aftrek is bij de ene zaak een harde poort en bij de andere
 * afrondingsruis. Een factor is schaalvrij en betekent overal hetzelfde:
 * "dit slot telt voor 40% van z'n waarde, want vorige week deden we het al".
 *
 * Waarom 0,6 sterkte: bij een typisch patroon liggen de opeenvolgende
 * weekdag-scores zo'n 10-45% uit elkaar. ×0,40 duwt de koploper onder de
 * derde dag (echte rotatie); een zachte ×0,8 zou niets verzetten.
 *
 * Stapelen mag (drie weken achtereen gebruikt weegt zwaarder dan één keer),
 * maar met een bodem, zodat het demping blijft: zijn de alternatieven zwak
 * genoeg, dan wint een veelgebruikt slot alsnog.
 */
export function cooldownFactor(hits: SlotHit[]): number {
  let factor = 1;
  for (const h of hits) {
    if (h.weeksAgo < 0 || h.weeksAgo >= COOLDOWN_WEEKS) continue;
    const strength = h.weak ? COOLDOWN_WEAK_STRENGTH : COOLDOWN_STRENGTH;
    factor *= 1 - strength * Math.pow(COOLDOWN_DECAY, h.weeksAgo);
  }
  return Math.max(COOLDOWN_FLOOR, factor);
}

// ============================================================
// Terugkoppeling (fase 4)
// ============================================================

/** Hoeveel metingen een slot minstens nodig heeft voordat het meeweegt. */
export const FEEDBACK_MIN_SAMPLES = 3;
/** Krimp naar neutraal: n/(n+k). Bij n=3 telt de uitslag voor ~43%. */
const FEEDBACK_SHRINK_K = 4;
/** Drukte-punten verschil dat een volle uitslag geeft. */
const FEEDBACK_LIFT_SCALE = 15;
/** Maximale uitslag op de score, naar boven én naar beneden. */
const FEEDBACK_MAX = 0.25;

export type SlotPerformance = {
  /** Mediane lift van dit slot, in drukte-punten. */
  medianLift: number;
  /** Aantal gemeten campagnes op dit slot. */
  samples: number;
};

/**
 * Weging van een weekdag×dagdeel-slot op basis van wat campagnes dáár eerder
 * deden. 1 = geen signaal.
 *
 * Het ijkpunt is de EIGEN mediaan van de zaak over al haar slots, niet nul.
 * Dat implementeert "slots waar campagnes structureel niets doen, demp je"
 * zoals bedoeld: een slot dat niets oplevert terwijl andere slots wél werken
 * zakt, maar als er nergens iets beweegt zakt er ook niets — dan ligt het
 * niet aan het slot en zou dempen een verkeerde conclusie zijn.
 *
 * Twee remmen, want dit is dunne data (een zaak maakt hooguit een paar
 * campagnes per week en er is geen controlegroep):
 *   1. onder FEEDBACK_MIN_SAMPLES doet een slot niets;
 *   2. daarboven krimpt de uitslag met n/(n+k), dus drie metingen verzetten
 *      minder dan twaalf.
 * De uitslag is begrensd op ±FEEDBACK_MAX, ruim onder de cool-down. De
 * terugkoppeling mag bijsturen, niet overrulen.
 */
export function feedbackFactor(
  slot: SlotPerformance | undefined,
  businessMedianLift: number,
): number {
  if (!slot || slot.samples < FEEDBACK_MIN_SAMPLES) return 1;
  const relative = slot.medianLift - businessMedianLift;
  const shrunk = relative * (slot.samples / (slot.samples + FEEDBACK_SHRINK_K));
  const scaled = Math.max(-1, Math.min(1, shrunk / FEEDBACK_LIFT_SCALE));
  return 1 + scaled * FEEDBACK_MAX;
}
