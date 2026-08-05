/**
 * ============================================================
 * IndustryPack — branche-specifieke laag bovenop Filly's brein
 * ============================================================
 *
 * `filly-brain.config.ts` bevat de KANAAL-mechanica (lengtes, hashtags,
 * timing, algoritme-gedrag). Die is grotendeels branche-neutraal. Wat
 * WEL per branche verschilt is de *taal en smaak*: een kapper heeft geen
 * "gerechten" maar "behandelingen", een gast is een "klant", en
 * "reserveren" heet "een afspraak boeken".
 *
 * Een IndustryPack legt precies die branche-laag vast:
 *   - lexicon       → canonieke vaktermen (het grootste hefboompunt)
 *   - systemFraming → hoe Filly zichzelf introduceert per branche
 *   - menuGuard     → de "vul eerst je aanbod in"-melding
 *   - themeLabels   → mensleesbare labels per thema-type
 *   - ctaLabels     → mensleesbare labels per CTA-template
 *   - channelFlavor → optionele per-kanaal smaak-overrides
 *
 * Ontwerp-principe: `horeca` is de volledig gevulde default en
 * reproduceert het HUIDIGE gedrag 1-op-1 (byte-identiek), zodat de
 * prompt-rewiring in Fase 3 voor horeca niets verandert. Branches die
 * (nog) geen eigen pack hebben vallen terug op de generieke pack.
 *
 * NB: deze module is in Fase 2 nog NIET aangesloten op de prompts. Dat
 * gebeurt in Fase 3 (de services gaan `getIndustryPack(industry)` lezen).
 */

import type {
  FillyChannel,
  ThemeType,
  CtaTemplate,
} from '../filly-brain.config';
import { DEFAULT_INDUSTRY, type Industry } from './industry.registry';
import { HORECA_PACK } from './packs/horeca.pack';
import { GENERIC_PACK } from './packs/generic.pack';

/**
 * Canonieke vaktermen. De prompts refereren straks aan bv.
 * `pack.lexicon.offeringPlural` i.p.v. het hardcoded woord "gerechten".
 * Alle velden verplicht: elke branche moet elke term invullen zodat er
 * nooit een gat in de vaktaal valt.
 */
export interface IndustryLexicon {
  /** Eén stuk aanbod: "gerecht" / "behandeling" / "dienst" / "les". */
  offering: string;
  /** Meervoud: "gerechten" / "behandelingen" / "diensten". */
  offeringPlural: string;
  /** De volledige lijst: "menukaart" / "behandelmenu" / "dienstenaanbod". */
  menu: string;
  /** Korte vorm: "menu" / "aanbod". */
  menuShort: string;
  /** Afnemer, enkelvoud: "gast" / "klant" / "lid". */
  customer: string;
  /** Afnemer, meervoud: "gasten" / "klanten" / "leden". */
  customerPlural: string;
  /** De afspraak/boeking, znw: "reservering" / "afspraak" / "boeking". */
  booking: string;
  /** De handeling, ww: "reserveren" / "een afspraak boeken". */
  bookingVerb: string;
  /** Het bezoekmoment: "eetmoment" / "afspraakmoment" / "trainingsmoment". */
  visitMoment: string;
  /** De zaak zelf: "restaurant" / "salon" / "studio" / "de zaak". */
  venue: string;
  /** De vakmens: "chef" / "kapper" / "therapeut" / "trainer". */
  professional: string;
}

/**
 * Optionele per-kanaal smaak-override. Overschrijft alléén de
 * horeca-gekleurde vrije-tekstvelden van CHANNEL_RULES; de mechanica
 * (lengtes/hashtags/timing-getallen) blijft uit filly-brain.config komen.
 * `undefined` (zoals bij horeca) = gebruik CHANNEL_RULES ongewijzigd.
 */
export interface ChannelFlavorOverride {
  role?: string;
  note?: string;
  fallback?: string;
  specifics?: string[];
}

export interface IndustryPack {
  /** De branche waar deze (resolved) pack voor staat. */
  industry: Industry;
  lexicon: IndustryLexicon;
  /**
   * Rol-omschrijving voor de system-prompt, ingevuld als
   * `Je bent Filly, ${systemFraming}.` — horeca: "een AI-assistent voor
   * de horeca" (exact de huidige tekst).
   */
  systemFraming: string;
  /** Korte sector-aanduiding: "de horeca" / "de wellnessbranche". */
  sectorLabel: string;
  /** Melding wanneer het aanbod (menu) nog te leeg is voor voorstellen. */
  menuGuardMessage: string;
  /** Mensleesbaar label per thema-type. */
  themeLabels: Record<ThemeType, string>;
  /** Mensleesbaar label per CTA-template. */
  ctaLabels: Record<CtaTemplate, string>;
  /** Per-kanaal branche-smaak (Fase 3 leunt hierop bij het ontvlechten). */
  channelFlavor?: Partial<Record<FillyChannel, ChannelFlavorOverride>>;
}

// ============================================================
// Resolver
// ============================================================

/**
 * Haal de pack op voor een branche. `horeca` krijgt de volledige pack;
 * elke andere branche valt (voorlopig) terug op de generieke pack, maar
 * met de échte industry-slug erin gestempeld zodat downstream-code
 * (analytics, vaktaal-gate) de werkelijke branche kent.
 *
 * Zodra een branche z'n eigen pack krijgt, voeg je 'm hier toe aan de
 * switch — de rest van de code hoeft niet te wijzigen.
 */
export function getIndustryPack(industry: Industry): IndustryPack {
  switch (industry) {
    case 'horeca':
      return HORECA_PACK;
    default:
      // Generieke fallback, maar met de echte branche-slug.
      return { ...GENERIC_PACK, industry };
  }
}

// ============================================================
// VAKTAAL-blok voor de system-prompt
// ============================================================

/**
 * Bouwt een compact "VAKTAAL"-blok dat Filly's woordkeuze naar de juiste
 * branche stuurt. Injecteren in de system-prompt (Fase 3).
 *
 * CRUCIAAL: voor de DEFAULT-branche (horeca) geeft dit een LEGE string
 * terug. Zo blijft de horeca-prompt byte-identiek aan vandaag — er wordt
 * niets toegevoegd. Alleen voor afwijkende branches krijgt Filly een
 * expliciete vertaal-instructie mee.
 */
export function buildVaktaalBlock(pack: IndustryPack): string {
  if (pack.industry === DEFAULT_INDUSTRY) return '';
  const lex = pack.lexicon;
  return [
    '────────────────────────────────────────',
    `VAKTAAL — deze zaak zit in ${pack.sectorLabel}. Gebruik consequent de juiste vaktermen:`,
    '────────────────────────────────────────',
    `- Het aanbod heet "${lex.offeringPlural}" (enkelvoud "${lex.offering}"), niet "gerechten".`,
    `- De volledige lijst is het "${lex.menu}" (kort: "${lex.menuShort}").`,
    `- Een afnemer is een "${lex.customer}" (meervoud "${lex.customerPlural}"), niet "gast".`,
    `- Boeken heet "${lex.bookingVerb}"; de boeking zelf is een "${lex.booking}".`,
    `- Het bezoekmoment is een "${lex.visitMoment}".`,
    `- De zaak noem je "${lex.venue}"; de vakmens is de "${lex.professional}".`,
    'Vermijd horeca-woorden (gerecht, menu, gast, reserveren, eetmoment) tenzij ze hier expliciet als vakterm staan.',
  ].join('\n');
}
