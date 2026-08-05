/**
 * Horeca-pack — de volledig gevulde default.
 *
 * Dit is de branche waar Get-Filly mee begon; alle waarden reproduceren
 * het HUIDIGE gedrag 1-op-1. Waar een prompt in Fase 3 een hardcoded
 * horeca-woord vervangt door een pack-verwijzing, moet de waarde hier
 * exact de oude tekst opleveren, zodat horeca-output byte-identiek blijft.
 *
 * `channelFlavor` is bewust afwezig: CHANNEL_RULES in filly-brain.config
 * IS al horeca-geijkt, dus horeca hoeft niets te overschrijven.
 */
import type { IndustryPack } from '../industry-pack';

export const HORECA_PACK: IndustryPack = {
  industry: 'horeca',
  lexicon: {
    offering: 'gerecht',
    offeringPlural: 'gerechten',
    menu: 'menukaart',
    menuShort: 'menu',
    customer: 'gast',
    customerPlural: 'gasten',
    booking: 'reservering',
    bookingVerb: 'reserveren',
    visitMoment: 'eetmoment',
    venue: 'restaurant',
    professional: 'chef',
  },
  // Exact de huidige system-prompt-tekst: "Je bent Filly, een AI-assistent
  // voor de horeca." Fase 3 zet dit terug als `Je bent Filly, ${...}.`.
  systemFraming: 'een AI-assistent voor de horeca',
  sectorLabel: 'de horeca',
  // Exact de huidige guard-melding op de drie generatie-endpoints.
  menuGuardMessage:
    'Vul eerst je menukaart in (minimaal 3 gerechten) zodat Filly concrete voorstellen kan doen.',
  themeLabels: {
    feestdag: 'feestdag',
    rustige_dag_actie: 'actie op een rustige dag',
    nieuw_menu: 'nieuw menu / nieuw gerecht',
    seizoens_aanbod: 'seizoensaanbod',
    eenmalig_event: 'eenmalig event',
    algemeen: 'algemeen',
  },
  ctaLabels: {
    reserveer: 'Reserveer',
    bel: 'Bel',
    bekijk_menu: 'Bekijk menu',
    vraag_in_comment: 'Reageer in de comments',
    bezoek: 'Kom langs',
    tag_vriend: 'Tag een vriend',
    save_voor_later: 'Bewaar voor later',
    rsvp_event: 'Meld je aan',
    andere: 'Andere',
  },
};
